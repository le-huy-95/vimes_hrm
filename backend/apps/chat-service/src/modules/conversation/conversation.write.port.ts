import type { Conversation, Message } from "@manage-teams/db";

/** Port ghi conversation/message — luôn đi primary (prismaWrite). */
export type ConversationWritePort = {
  /** Tạo conversation GROUP. */
  createGroupConversation(groupId: string): Promise<Conversation>;
  /** Tạo conversation TASK_THREAD. */
  createTaskConversation(input: {
    groupId: string;
    taskId: string;
    taskCode: string;
  }): Promise<Conversation>;
  /** Tạo conversation DM trong group. */
  createDmConversation(input: {
    groupId: string;
    dmPairKey: string;
    title?: string | null;
  }): Promise<Conversation>;
  /** Upsert member ACTIVE. */
  upsertMember(conversationId: string, userId: string): Promise<void>;
  /** Đánh dấu member REMOVED trên nhiều conversation. */
  markMembersRemoved(conversationIds: string[], userId: string): Promise<void>;
  /**
   * Tạo message mới với seq tăng trong transaction (FOR UPDATE max seq).
   */
  createMessageWithNextSeq(input: {
    conversationId: string;
    clientMsgId: string;
    senderUserId: string;
    body: string;
    replyToId?: string | null;
    origin?: string;
  }): Promise<Message>;
  /** Gắn file đã upload vào message (message_attachments). */
  attachFiles(messageId: string, fileIds: string[]): Promise<void>;
  /** Cập nhật last_read_seq của member (chỉ tăng). */
  updateLastReadSeq(conversationId: string, userId: string, seq: number): Promise<void>;
  /** Soft-delete tin (chỉ sender). */
  softDeleteMessage(messageId: string): Promise<Message>;
  /** Sửa nội dung tin (chỉ sender, chưa xoá). */
  editMessage(messageId: string, body: string): Promise<Message>;
};
