import { z } from "zod";

export const entityTypeSchema = z.enum(["avatar", "task_attachment", "other"]);

export const presignBodySchema = z.object({
  originalName: z.string().min(1).max(255),
  mimeType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
  ]),
  sizeBytes: z.number().int().positive(),
  entityType: entityTypeSchema,
  entityId: z.string().optional(),
});

export const confirmBodySchema = presignBodySchema.extend({
  bucketKey: z.string().min(1).max(512),
});

export const avatarBodySchema = z.object({
  fileId: z.string().min(1),
});

export const taskAttachmentBodySchema = z.object({
  fileId: z.string().min(1),
});

export type PresignBody = z.infer<typeof presignBodySchema>;
export type ConfirmBody = z.infer<typeof confirmBodySchema>;
