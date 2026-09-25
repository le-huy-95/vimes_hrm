import { z } from "zod";

export const activityQuerySchema = z.object({
  cursor: z.string().optional(),
  take: z.coerce.number().min(1).max(100).default(20),
});
