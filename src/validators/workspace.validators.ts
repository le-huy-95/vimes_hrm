import { z } from "zod";

export const mapGroupBodySchema = z.object({ teamId: z.string().min(1) });

export const listQuerySchema = z.object({
  cursor: z.string().optional(),
  take: z.coerce.number().min(1).max(100).default(50),
  skip: z.coerce.number().min(0).default(0).optional(),
});
