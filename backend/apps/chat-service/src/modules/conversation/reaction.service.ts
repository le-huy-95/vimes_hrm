import { prismaRead, prismaWrite, Prisma } from "@manage-teams/db";
import { AppError } from "@manage-teams/lib";
import { assertActiveMember } from "../conversation/conversation.service.js";
import { enqueuePushJob } from "../push/push.service.js";
import { buildHighlight } from "./search-highlight.js";

export { buildHighlight } from "./search-highlight.js";

/** Thêm/xoá reaction emoji trên tin nhắn. */
export async function toggleReaction(input: {
  userId: string;
  conversationId: string;
  messageId: string;
  emoji: string;
}) {
  await assertActiveMember(input.conversationId, input.userId);
  const emoji = input.emoji.trim().slice(0, 32);
  if (!emoji) throw new AppError("Cần emoji", "VALIDATION", 400);

  const msg = await prismaRead.message.findFirst({
    where: { id: input.messageId, conversationId: input.conversationId, deletedAt: null },
  });
  if (!msg) throw new AppError("Không tìm thấy", "NOT_FOUND", 404);

  const existing = await prismaRead.messageReaction.findUnique({
    where: {
      messageId_userId_emoji: {
        messageId: input.messageId,
        userId: input.userId,
        emoji,
      },
    },
  });

  if (existing) {
    await prismaWrite.messageReaction.delete({
      where: {
        messageId_userId_emoji: {
          messageId: input.messageId,
          userId: input.userId,
          emoji,
        },
      },
    });
    return { removed: true, emoji };
  }

  await prismaWrite.messageReaction.create({
    data: { messageId: input.messageId, userId: input.userId, emoji },
  });

  if (msg.senderUserId !== input.userId) {
    void enqueuePushJob({
      userId: msg.senderUserId,
      kind: "reaction",
      payload: {
        conversationId: input.conversationId,
        messageId: input.messageId,
        fromUserId: input.userId,
        emoji,
      },
    }).catch(() => {
      /* best-effort */
    });
  }

  return { removed: false, emoji };
}

/** Tổng hợp reaction theo message. */
export async function listReactions(conversationId: string, messageId: string, userId: string) {
  await assertActiveMember(conversationId, userId);
  const rows = await prismaRead.messageReaction.findMany({
    where: { messageId },
  });
  const byEmoji = new Map<string, { count: number; me: boolean }>();
  for (const r of rows) {
    const cur = byEmoji.get(r.emoji) ?? { count: 0, me: false };
    cur.count += 1;
    if (r.userId === userId) cur.me = true;
    byEmoji.set(r.emoji, cur);
  }
  return {
    reactions: [...byEmoji.entries()].map(([emoji, v]) => ({ emoji, ...v })),
  };
}

/** Tìm kiếm tin trong conversation (unaccent FTS + highlight). */
export async function searchMessages(input: {
  userId: string;
  conversationId: string;
  q: string;
  limit?: number;
  /** Optional: chỉ trả tin nếu conversation thuộc group này. */
  groupId?: string;
  /** Optional: chỉ trả tin nếu conversation là task thread này. */
  taskId?: string;
}) {
  await assertActiveMember(input.conversationId, input.userId);
  const q = input.q.trim();
  if (q.length < 2) throw new AppError("Từ khóa tìm kiếm quá ngắn", "VALIDATION", 400);
  const limit = Math.min(input.limit ?? 30, 100);

  const conv = await prismaRead.conversation.findUnique({
    where: { id: input.conversationId },
  });
  if (!conv) throw new AppError("Không tìm thấy", "NOT_FOUND", 404);
  if (input.groupId && conv.groupId !== input.groupId) {
    throw new AppError("Hội thoại không thuộc nhóm", "VALIDATION", 400);
  }
  if (input.taskId && conv.taskId !== input.taskId) {
    throw new AppError("Hội thoại không thuộc công việc", "VALIDATION", 400);
  }

  // plainto_tsquery + unaccent
  const rows = await prismaRead.$queryRaw<
    Array<{ id: string; seq: number; body: string; sender_user_id: string; created_at: Date }>
  >`
    SELECT id, seq, body, sender_user_id, created_at
    FROM messages
    WHERE conversation_id = ${input.conversationId}::uuid
      AND deleted_at IS NULL
      AND body_tsv @@ plainto_tsquery('simple', unaccent(${q}))
    ORDER BY seq DESC
    LIMIT ${limit}
  `;

  return {
    messages: rows.map((m) => ({
      id: m.id,
      seq: m.seq,
      body: m.body,
      highlight: buildHighlight(m.body, q),
      senderUserId: m.sender_user_id,
      createdAt: m.created_at,
    })),
    filter: {
      conversationId: input.conversationId,
      groupId: conv.groupId,
      taskId: conv.taskId,
    },
  };
}

export { Prisma };
