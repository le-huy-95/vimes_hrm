import type { Conversation, ConversationMember, Message } from "@manage-teams/db";

export type MessageListRow = Message & {
  attachments?: Array<{ fileId: string }>;
  reactions?: Array<{ emoji: string; userId: string }>;
};

/** Port đọc conversation/message — phase sau có thể trỏ replica / projection. */
export type ConversationReadPort = {
  /** Tìm conversation GROUP theo groupId. */
  findGroupConversation(groupId: string): Promise<Conversation | null>;
  /** Tìm conversation TASK_THREAD theo taskId. */
  findTaskConversation(taskId: string): Promise<Conversation | null>;
  /** Lấy membership ACTIVE của user trong conversation. */
  findActiveMember(
    conversationId: string,
    userId: string,
  ): Promise<ConversationMember | null>;
  /** Liệt kê conversation user đang tham gia. */
  listMemberships(userId: string): Promise<
    Array<{
      lastReadSeq: number;
      conversation: Conversation;
    }>
  >;
  /** Lấy tin nhắn sau seq (tối đa 100). */
  listMessagesAfter(conversationId: string, afterSeq: number): Promise<MessageListRow[]>;
  /** Lấy last-N tin mới nhất (cho cache seed). */
  listLastNMessages(conversationId: string, take: number): Promise<MessageListRow[]>;
  /** Tìm message theo clientMsgId (idempotent). */
  findMessageByClientId(conversationId: string, clientMsgId: string): Promise<Message | null>;
  /** Tìm message theo id. */
  findMessageById(messageId: string): Promise<Message | null>;
  /** Liệt kê id conversation thuộc group. */
  listConversationIdsByGroup(groupId: string): Promise<string[]>;
  /** Tìm DM theo group + dm_pair_key. */
  findDmConversation(groupId: string, dmPairKey: string): Promise<Conversation | null>;
  /** ACTIVE group_members user ids. */
  listActiveGroupMemberIds(groupId: string): Promise<string[]>;
  /** Kiểm tra user là ACTIVE member của group. */
  isActiveGroupMember(groupId: string, userId: string): Promise<boolean>;
  /** Group tồn tại? */
  groupExists(groupId: string): Promise<boolean>;
};
