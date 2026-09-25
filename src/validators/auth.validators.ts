/**
 * Zod schemas cho Auth — tách khỏi route/controller để tái sử dụng (DRY).
 * parse() ném ZodError → errorHandler trả 400 Validation failed.
 */
import { z } from "zod";

export const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  orgName: z.string().min(1),
});

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const oauthCodeSchema = z.string().min(1);
export const oauthStateSchema = z.string().min(1);
