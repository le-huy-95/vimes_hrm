import type { Server as SocketServer } from "socket.io";
import { AppError } from "@manage-teams/lib";
import { Prisma, prismaRead } from "@manage-teams/db";
import {
  getLastNCache,
  invalidateLastNCache,
  setLastNCache,
  LAST_N,
} from "../../infra/message-cache.js";
import { enqueuePushJob } from "../push/push.service.js";
import { conversationPrismaRepo } from "./conversation.prisma.repo.js";
import type { ConversationReadPort } from "./conversation.read.port.js";
import type { ConversationWritePort } from "./conversation.write.port.js";
import { buildDmPairKey } from "./dm-pair.js";

const repo: ConversationReadPort & ConversationWritePort = conversationPrismaRepo;
const internalToken = process.env.INTERNAL_SERVICE_TOKEN ?? "dev-internal-token";

/** Kiểm tra header nội bộ giữa core ↔ chat. */
export function requireInternal(header: string | undefined): void {
  if (header !== internalToken) {
    throw new AppError("Không có quyền", "FORBIDDEN", 403);
  }
}

async function ensureMembers(conversationId: string, memberIds: string[]): Promise<void> {
  for (const userId of memberIds) {
    await repo.upsertMember(conversationId, userId);
  }
}

function mapMessage(
  m: {
    id: string;
    seq: number;
    clientMsgId: string | null;
    senderUserId: string;
    body: string;
    replyToId?: string | null;
    createdAt: Date;
    editedAt?: Date | null;
    deletedAt?: Date | null;
    fileIds?: string[];
    mentions?: string[];
    attachments?: Array<{ fileId: string }>;
    reactions?: Array<{ emoji: string; userId: string }>;
  },
  viewerUserId?: string,
) {
  const fileIds = m.fileIds ?? m.attachments?.map((a) => a.fileId) ?? [];
  const reactionMap = new Map<string, { count: number; me: boolean }>();
  for (const r of m.reactions ?? []) {
    const cur = reactionMap.get(r.emoji) ?? { count: 0, me: false };
    cur.count += 1;
    if (viewerUserId && r.userId === viewerUserId) cur.me = true;
    reactionMap.set(r.emoji, cur);
  }
  return {
    id: m.id,
    seq: m.seq,
    clientMsgId: m.clientMsgId,
    senderUserId: m.senderUserId,
    body: m.deletedAt ? "" : m.body,
    replyToId: m.replyToId ?? null,
    fileIds,
    mentions: m.mentions ?? [],
    reactions: [...reactionMap.entries()].map(([emoji, v]) => ({ emoji, ...v })),
    createdAt: m.createdAt,
    editedAt: m.editedAt ?? null,
    deleted: Boolean(m.deletedAt),
  };
}

/** Parse mention dạng @<uuid> trong body. */
export function extractMentions(body: string): string[] {
  const re = /@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) ids.add(m[1]!.toLowerCase());
  return [...ids];
}

/** Chỉ giữ mention của member ACTIVE trong conversation. */
export async function filterMentionsToMembers(
  conversationId: string,
  mentionIds: string[],
): Promise<string[]> {
  if (mentionIds.length === 0) return [];
  const members = await prismaRead.conversationMember.findMany({
    where: {
      conversationId,
      userId: { in: mentionIds },
      status: "ACTIVE",
    },
    select: { userId: true },
  });
  const allowed = new Set(members.map((m) => m.userId.toLowerCase()));
  return mentionIds.filter((id) => allowed.has(id.toLowerCase()));
}

/** Đảm bảo có conversation GROUP cho group + members. */
export async function ensureGroupConversation(groupId: string, memberIds: string[]) {
  let conv = await repo.findGroupConversation(groupId);
  if (!conv) {
    try {
      conv = await repo.createGroupConversation(groupId);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        conv = await repo.findGroupConversation(groupId);
      } else throw err;
    }
  }
  if (!conv) throw new AppError("Không tạo được hội thoại nhóm", "INTERNAL", 500);
  await ensureMembers(conv.id, memberIds);
  return { conversationId: conv.id };
}

/** Public: user ensure group chat — sync toàn bộ ACTIVE members. */
export async function ensureGroupConversationForUser(userId: string, groupId: string) {
  if (!(await repo.groupExists(groupId))) {
    throw new AppError("Không tìm thấy nhóm", "NOT_FOUND", 404);
  }
  if (!(await repo.isActiveGroupMember(groupId, userId))) {
    throw new AppError("Không có quyền", "FORBIDDEN", 403);
  }
  const memberIds = await repo.listActiveGroupMemberIds(groupId);
  const result = await ensureGroupConversation(groupId, memberIds);
  const conv = await repo.findGroupConversation(groupId);
  return {
    conversationId: result.conversationId,
    type: "GROUP" as const,
    groupId,
    title: conv?.title ?? "Group chat",
  };
}

/** Public: user ensure DM 1-1 trong group. */
export async function ensureDmConversationForUser(
  userId: string,
  groupId: string,
  peerUserId: string,
) {
  if (userId.toLowerCase() === peerUserId.toLowerCase()) {
    throw new AppError("Không thể chat với chính mình", "FORBIDDEN", 403);
  }
  if (!(await repo.groupExists(groupId))) {
    throw new AppError("Không tìm thấy nhóm", "NOT_FOUND", 404);
  }
  if (!(await repo.isActiveGroupMember(groupId, userId))) {
    throw new AppError("Không có quyền", "FORBIDDEN", 403);
  }
  if (!(await repo.isActiveGroupMember(groupId, peerUserId))) {
    throw new AppError("Thành viên không thuộc nhóm", "FORBIDDEN", 403);
  }

  const dmPairKey = buildDmPairKey(userId, peerUserId);
  let conv = await repo.findDmConversation(groupId, dmPairKey);
  if (!conv) {
    try {
      conv = await repo.createDmConversation({ groupId, dmPairKey, title: null });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        conv = await repo.findDmConversation(groupId, dmPairKey);
      } else throw err;
    }
  }
  if (!conv) throw new AppError("Không tạo được hội thoại", "INTERNAL", 500);
  await ensureMembers(conv.id, [userId, peerUserId]);
  return {
    conversationId: conv.id,
    type: "DM" as const,
    groupId,
    title: conv.title,
  };
}

/** Đảm bảo có conversation TASK_THREAD cho task. */
export async function ensureTaskConversation(input: {
  groupId: string;
  taskId: string;
  taskCode: string;
  memberIds: string[];
}) {
  let conv = await repo.findTaskConversation(input.taskId);
  if (!conv) {
    try {
      conv = await repo.createTaskConversation(input);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        conv = await repo.findTaskConversation(input.taskId);
      } else throw err;
    }
  }
  if (!conv) throw new AppError("Không tạo được hội thoại công việc", "INTERNAL", 500);
  await ensureMembers(conv.id, input.memberIds);
  return { conversationId: conv.id };
}

/** Gỡ user khỏi mọi conversation thuộc group. */
export async function removeMemberFromGroupChats(groupId: string, userId: string) {
  const ids = await repo.listConversationIdsByGroup(groupId);
  await repo.markMembersRemoved(ids, userId);
  return { ok: true as const };
}

/** Liệt kê conversation của user. */
export async function listConversations(userId: string) {
  const memberships = await repo.listMemberships(userId);
  const dmIds = memberships
    .filter((m) => m.conversation.type === "DM")
    .map((m) => m.conversation.id);

  const peerByConv = new Map<string, string>();
  if (dmIds.length > 0) {
    const peers = await prismaRead.conversationMember.findMany({
      where: {
        conversationId: { in: dmIds },
        status: "ACTIVE",
        NOT: { userId },
      },
      select: {
        conversationId: true,
        userId: true,
      },
    });
    const peerUserIds = [...new Set(peers.map((p) => p.userId))];
    const users =
      peerUserIds.length === 0
        ? []
        : await prismaRead.user.findMany({
            where: { id: { in: peerUserIds } },
            select: { id: true, displayName: true, email: true },
          });
    const labelByUser = new Map(
      users.map((u) => [
        u.id,
        (u.displayName?.trim() || u.email || u.id) as string,
      ]),
    );
    for (const p of peers) {
      peerByConv.set(p.conversationId, labelByUser.get(p.userId) ?? p.userId);
    }
  }

  return {
    conversations: memberships.map((m) => {
      const c = m.conversation;
      const title =
        c.type === "DM"
          ? c.title?.trim() || peerByConv.get(c.id) || "Tin nhắn"
          : c.title;
      return {
        id: c.id,
        type: c.type,
        groupId: c.groupId,
        taskId: c.taskId,
        title,
        lastReadSeq: m.lastReadSeq,
      };
    }),
  };
}

/**
 * Lấy tin nhắn sau seq (bù reconnect).
 * afterSeq=0: thử Redis last-N rồi DB.
 */
export async function listMessages(userId: string, conversationId: string, afterSeq: number) {
  const member = await repo.findActiveMember(conversationId, userId);
  if (!member || member.status !== "ACTIVE") {
    throw new AppError("Không có quyền", "FORBIDDEN", 403);
  }

  if (afterSeq <= 0) {
    const cached = await getLastNCache(conversationId);
    if (cached) {
      return { messages: cached, cached: true };
    }
    const rows = await repo.listLastNMessages(conversationId, LAST_N);
    const mapped = rows.map((m) => mapMessage(m, userId));
    await setLastNCache(
      conversationId,
      mapped.map((m) => ({
        id: m.id,
        seq: m.seq,
        clientMsgId: m.clientMsgId,
        senderUserId: m.senderUserId,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        replyToId: m.replyToId,
        fileIds: m.fileIds,
        reactions: m.reactions,
        mentions: m.mentions,
        editedAt: m.editedAt?.toISOString() ?? null,
        deleted: m.deleted,
      })),
    );
    return { messages: mapped, cached: false };
  }

  const messages = await repo.listMessagesAfter(conversationId, afterSeq);
  return { messages: messages.map((m) => mapMessage(m, userId)), cached: false };
}

/** Gửi tin nhắn (idempotent theo clientMsgId) + emit Socket. */
export async function postMessage(
  userId: string,
  conversationId: string,
  input: {
    body: string;
    clientMsgId: string;
    fileIds?: string[];
    replyToId?: string;
  },
  io?: SocketServer,
) {
  const member = await repo.findActiveMember(conversationId, userId);
  if (!member || member.status !== "ACTIVE") {
    throw new AppError("Không có quyền", "FORBIDDEN", 403);
  }

  const fileIds = input.fileIds ?? [];
  if (!input.body.trim() && fileIds.length === 0) {
    throw new AppError("Cần nội dung hoặc file đính kèm", "VALIDATION", 400);
  }

  if (input.replyToId) {
    const reply = await repo.findMessageById(input.replyToId);
    if (!reply || reply.conversationId !== conversationId || reply.deletedAt) {
      throw new AppError("Tin nhắn trả lời không hợp lệ", "VALIDATION", 400);
    }
  }

  if (fileIds.length > 0) {
    const files = await prismaRead.fileObject.findMany({
      where: { id: { in: fileIds }, status: "READY", conversationId },
    });
    if (files.length !== fileIds.length) {
      throw new AppError("File chưa sẵn sàng hoặc không thuộc hội thoại", "FILE_NOT_READY", 400);
    }
  }

  const existing = await repo.findMessageByClientId(conversationId, input.clientMsgId);
  if (existing) {
    return {
      status: 200 as const,
      message: { ...mapMessage(existing), deduped: true },
    };
  }

  const message = await repo.createMessageWithNextSeq({
    conversationId,
    clientMsgId: input.clientMsgId,
    senderUserId: userId,
    body: input.body,
    replyToId: input.replyToId ?? null,
  });

  if (fileIds.length > 0) {
    await repo.attachFiles(message.id, fileIds);
  }

  const rawMentions = extractMentions(input.body);
  const mentions = await filterMentionsToMembers(conversationId, rawMentions);
  await invalidateLastNCache(conversationId);

  const payload = {
    ...mapMessage({ ...message, fileIds, mentions }),
    conversationId,
  };
  io?.to(`conv:${conversationId}`).emit("message:new", payload);
  for (const mentionedUserId of mentions) {
    if (mentionedUserId === userId) continue;
    io?.to(`user:${mentionedUserId}`).emit("mention:notify", {
      conversationId,
      messageId: message.id,
      fromUserId: userId,
      preview: input.body.slice(0, 120),
    });
    void enqueuePushJob({
      userId: mentionedUserId,
      kind: "mention",
      payload: {
        conversationId,
        messageId: message.id,
        fromUserId: userId,
        preview: input.body.slice(0, 120),
      },
    }).catch(() => {
      /* best-effort */
    });
  }
  return { status: 201 as const, message: payload };
}

/** Cập nhật last_read_seq. */
export async function markRead(userId: string, conversationId: string, seq: number) {
  const member = await repo.findActiveMember(conversationId, userId);
  if (!member || member.status !== "ACTIVE") {
    throw new AppError("Không có quyền", "FORBIDDEN", 403);
  }
  await repo.updateLastReadSeq(conversationId, userId, seq);
  return { ok: true as const, lastReadSeq: Math.max(member.lastReadSeq, seq) };
}

/** Soft-delete tin của chính mình. */
export async function deleteMessage(
  userId: string,
  conversationId: string,
  messageId: string,
  io?: SocketServer,
) {
  const member = await repo.findActiveMember(conversationId, userId);
  if (!member || member.status !== "ACTIVE") {
    throw new AppError("Không có quyền", "FORBIDDEN", 403);
  }
  const msg = await repo.findMessageById(messageId);
  if (!msg || msg.conversationId !== conversationId) {
    throw new AppError("Không tìm thấy", "NOT_FOUND", 404);
  }
  if (msg.senderUserId !== userId) {
    throw new AppError("Không có quyền", "FORBIDDEN", 403);
  }
  const updated = await repo.softDeleteMessage(messageId);
  await invalidateLastNCache(conversationId);
  const payload = { ...mapMessage(updated), conversationId };
  io?.to(`conv:${conversationId}`).emit("message:deleted", payload);
  return { message: payload };
}

/** Sửa tin của chính mình. */
export async function editMessage(
  userId: string,
  conversationId: string,
  messageId: string,
  body: string,
  io?: SocketServer,
) {
  const member = await repo.findActiveMember(conversationId, userId);
  if (!member || member.status !== "ACTIVE") {
    throw new AppError("Không có quyền", "FORBIDDEN", 403);
  }
  const msg = await repo.findMessageById(messageId);
  if (!msg || msg.conversationId !== conversationId || msg.deletedAt) {
    throw new AppError("Không tìm thấy", "NOT_FOUND", 404);
  }
  if (msg.senderUserId !== userId) {
    throw new AppError("Không có quyền", "FORBIDDEN", 403);
  }
  const updated = await repo.editMessage(messageId, body);
  await invalidateLastNCache(conversationId);
  const payload = { ...mapMessage(updated), conversationId };
  io?.to(`conv:${conversationId}`).emit("message:edited", payload);
  return { message: payload };
}

/** Assert membership ACTIVE — dùng cho Socket join. */
export async function assertActiveMember(conversationId: string, userId: string): Promise<void> {
  const member = await repo.findActiveMember(conversationId, userId);
  if (!member || member.status !== "ACTIVE") {
    throw new Error("FORBIDDEN");
  }
}

/**
 * Phase 3.5: ingest tin từ Google Chat (origin=GOOGLE_CHAT).
 * Idempotent theo clientMsgId = google message name hash.
 */
export async function ingestExternalMessage(input: {
  conversationId: string;
  senderUserId: string;
  body: string;
  clientMsgId: string;
  origin?: string;
}) {
  const existing = await repo.findMessageByClientId(input.conversationId, input.clientMsgId);
  if (existing) {
    return { status: 200 as const, message: mapMessage(existing), deduped: true };
  }
  const message = await repo.createMessageWithNextSeq({
    conversationId: input.conversationId,
    clientMsgId: input.clientMsgId,
    senderUserId: input.senderUserId,
    body: input.body,
    origin: input.origin ?? "GOOGLE_CHAT",
  });
  await invalidateLastNCache(input.conversationId);
  return {
    status: 201 as const,
    message: mapMessage(message),
    deduped: false,
  };
}
