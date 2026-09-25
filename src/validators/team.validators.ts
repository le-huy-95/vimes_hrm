/** Zod schemas cho Team & member endpoints */
import { z } from "zod";

export const createTeamBodySchema = z.object({
  name: z.string().min(1),
});

export const updateTeamBodySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});

export const addMemberBodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["lead", "member", "viewer"]).default("member"),
});

export const updateMemberBodySchema = z
  .object({
    role: z.enum(["lead", "member", "viewer"]).optional(),
    githubLogin: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .nullable()
      .optional(),
  })
  .refine(
    (b) => b.role !== undefined || b.githubLogin !== undefined,
    { message: "Provide role and/or githubLogin" },
  );

/** @deprecated alias — prefer updateMemberBodySchema */
export const updateMemberRoleBodySchema = updateMemberBodySchema;
