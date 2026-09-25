import { z } from "zod";

export const messagesQuerySchema = z.object({
  after: z.string().optional(),
  before: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
});

export const createMessageBodySchema = z.object({
  content: z.string().max(8000).default(""),
  attachmentFileId: z.string().optional(),
  replyToId: z.string().optional(),
});
