import { prismaRead, prismaWrite, Prisma } from "@manage-teams/db";
import type { ConversationReadPort } from "./conversation.read.port.js";
import type { ConversationWritePort } from "./conversation.write.port.js";

/**
 * Implement Prisma cho port đọc/ghi conversation.
 * Đọc dùng prismaRead; ghi dùng prismaWrite — sẵn sàng gắn replica.
 */
export const conversationPrismaRepo: ConversationReadPort & ConversationWritePort = {
  findGroupConversation(groupId) {
    return prismaRead.conversation.findFirst({ where: { groupId, type: "GROUP" } });
  },

  findTaskConversation(taskId) {
    return prismaRead.conversation.findFirst({ where: { taskId, type: "TASK_THREAD" } });
  },

  findActiveMember(conversationId, userId) {
    return prismaRead.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
  },

  async listMemberships(userId) {
    const rows = await prismaRead.conversationMember.findMany({
      where: { userId, status: "ACTIVE" },
      include: { conversation: true },
      orderBy: { joinedAt: "desc" },
    });
    return rows.map((m) => ({ lastReadSeq: m.lastReadSeq, conversation: m.conversation }));
  },

  listMessagesAfter(conversationId, afterSeq) {
    return prismaRead.message.findMany({
      where: { conversationId, seq: { gt: afterSeq }, deletedAt: null },
      orderBy: { seq: "asc" },
      take: 100,
      include: {
        attachments: { select: { fileId: true } },
        reactions: { select: { emoji: true, userId: true } },
      },
    });
  },

  listLastNMessages(conversationId, take) {
    return prismaRead.message.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { seq: "desc" },
      take,
      include: {
        attachments: { select: { fileId: true } },
        reactions: { select: { emoji: true, userId: true } },
      },
    }).then((rows) => rows.reverse());
  },

  findMessageByClientId(conversationId, clientMsgId) {
    return prismaRead.message.findUnique({
      where: { conversationId_clientMsgId: { conversationId, clientMsgId } },
    });
  },

  findMessageById(messageId) {
    return prismaRead.message.findUnique({ where: { id: messageId } });
  },

  async listConversationIdsByGroup(groupId) {
    const convs = await prismaRead.conversation.findMany({
      where: { groupId },
      select: { id: true },
    });
    return convs.map((c) => c.id);
  },

  findDmConversation(groupId, dmPairKey) {
    return prismaRead.conversation.findFirst({
      where: { groupId, type: "DM", dmPairKey },
    });
  },

  async listActiveGroupMemberIds(groupId) {
    const rows = await prismaRead.groupMember.findMany({
      where: { groupId, status: "ACTIVE" },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  },

  async isActiveGroupMember(groupId, userId) {
    const row = await prismaRead.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    return row?.status === "ACTIVE";
  },

  async groupExists(groupId) {
    const row = await prismaRead.group.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
    return Boolean(row);
  },

  createGroupConversation(groupId) {
    return prismaWrite.conversation.create({
      data: { type: "GROUP", groupId, title: "Group chat" },
    });
  },

  createTaskConversation(input) {
    return prismaWrite.conversation.create({
      data: {
        type: "TASK_THREAD",
        groupId: input.groupId,
        taskId: input.taskId,
        title: `Task ${input.taskCode}`,
      },
    });
  },

  createDmConversation(input) {
    return prismaWrite.conversation.create({
      data: {
        type: "DM",
        groupId: input.groupId,
        dmPairKey: input.dmPairKey,
        title: input.title ?? null,
      },
    });
  },

  async upsertMember(conversationId, userId) {
    await prismaWrite.conversationMember.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: { conversationId, userId, status: "ACTIVE" },
      update: { status: "ACTIVE" },
    });
  },

  async markMembersRemoved(conversationIds, userId) {
    await prismaWrite.conversationMember.updateMany({
      where: { userId, conversationId: { in: conversationIds } },
      data: { status: "REMOVED" },
    });
  },

  createMessageWithNextSeq(input) {
    return prismaWrite.$transaction(async (tx) => {
      // Lock conversation row (FOR UPDATE + aggregate is illegal in Postgres).
      await tx.$queryRaw`
        SELECT id FROM conversations WHERE id = ${input.conversationId}::uuid FOR UPDATE
      `;
      const rows = await tx.$queryRaw<{ max: number | null }[]>`
        SELECT MAX(seq) AS max FROM messages WHERE conversation_id = ${input.conversationId}::uuid
      `;
      const nextSeq = (rows[0]?.max ?? 0) + 1;
      return tx.message.create({
        data: {
          conversationId: input.conversationId,
          seq: nextSeq,
          clientMsgId: input.clientMsgId,
          senderUserId: input.senderUserId,
          body: input.body,
          replyToId: input.replyToId ?? null,
          origin: input.origin ?? "APP",
        },
      });
    });
  },

  async attachFiles(messageId: string, fileIds: string[]) {
    for (const fileId of fileIds) {
      await prismaWrite.messageAttachment.create({
        data: { messageId, fileId },
      });
    }
  },

  async updateLastReadSeq(conversationId, userId, seq) {
    await prismaWrite.conversationMember.updateMany({
      where: {
        conversationId,
        userId,
        status: "ACTIVE",
        lastReadSeq: { lt: seq },
      },
      data: { lastReadSeq: seq },
    });
  },

  softDeleteMessage(messageId) {
    return prismaWrite.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), body: "" },
    });
  },

  editMessage(messageId, body) {
    return prismaWrite.message.update({
      where: { id: messageId },
      data: { body, editedAt: new Date() },
    });
  },
};

export { Prisma };
