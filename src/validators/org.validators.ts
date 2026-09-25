/** Zod schemas cho Organization endpoints */
import { z } from "zod";

export const updateOrgBodySchema = z.object({
  name: z.string().min(1).optional(),
  domain: z.string().nullable().optional(),
});

export const createOrgUserBodySchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  password: z.string().min(8),
});
