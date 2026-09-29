import { z } from "zod";

export const EnsureGroupSchema = z.object({
  groupId: z.string().uuid(),
  memberIds: z.array(z.string().uuid()).default([]),
});

/** Public JWT: chỉ cần groupId — server tự load members. */
export const EnsureGroupPublicSchema = z.object({
  groupId: z.string().uuid(),
});

export const EnsureTaskSchema = z.object({
  groupId: z.string().uuid(),
  taskId: z.string().uuid(),
  taskCode: z.string(),
  memberIds: z.array(z.string().uuid()).default([]),
});

/** Public JWT: DM 1-1 trong group. */
export const EnsureDmPublicSchema = z.object({
  groupId: z.string().uuid(),
  peerUserId: z.string().uuid(),
});

export const RemoveMemberSchema = z.object({
  groupId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const PostMessageSchema = z.object({
  body: z.string().max(8000).default(""),
  clientMsgId: z.string().min(8).max(64),
  fileIds: z.array(z.string().uuid()).max(10).optional(),
  replyToId: z.string().uuid().optional(),
});

export const MarkReadSchema = z.object({
  seq: z.number().int().nonnegative(),
});

export const EditMessageSchema = z.object({
  body: z.string().min(1).max(8000),
});

export const IngestExternalSchema = z.object({
  conversationId: z.string().uuid(),
  senderUserId: z.string().uuid(),
  body: z.string().max(8000),
  clientMsgId: z.string().min(8).max(200),
  origin: z.string().default("GOOGLE_CHAT"),
});
