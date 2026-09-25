import { BaseRepository } from "./base.repository.js";

export class MessageRepository extends BaseRepository {
  findById(id: string) {
    return this.db.message.findUnique({ where: { id } });
  }

  create(input: {
    channelId: string;
    senderId: string;
    content: string;
    attachmentFileId?: string | null;
    replyToId?: string | null;
  }) {
    return this.db.message.create({
      data: {
        channelId: input.channelId,
        senderId: input.senderId,
        content: input.content,
        attachmentFileId: input.attachmentFileId ?? null,
        replyToId: input.replyToId ?? null,
      },
      include: {
        sender: {
          select: { id: true, email: true, fullName: true },
        },
      },
    });
  }

  listByChannel(input: {
    channelId: string;
    take: number;
    after?: string;
    before?: string;
  }) {
    return this.db.message.findMany({
      where: {
        channelId: input.channelId,
        ...(input.after ? { id: { gt: input.after } } : {}),
        ...(input.before ? { id: { lt: input.before } } : {}),
      },
      orderBy: { createdAt: input.after ? "asc" : "desc" },
      take: input.take,
      include: {
        sender: {
          select: { id: true, email: true, fullName: true },
        },
      },
    });
  }

  markRead(messageId: string, userId: string) {
    return this.db.messageReadStatus.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId },
      update: { readAt: new Date() },
    });
  }
}
