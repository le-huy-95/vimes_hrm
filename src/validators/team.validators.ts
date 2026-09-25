/** Zod schemas cho Team & member endpoints */
import { z } from "zod";

export const createTeamBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  parentTeamId: z.string().optional(),
});

export const updateTeamBodySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});

export const addMemberBodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["lead", "member", "viewer"]).default("member"),
});

export const updateMemberRoleBodySchema = z.object({
  role: z.enum(["lead", "member", "viewer"]),
});
