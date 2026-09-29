import { z } from "zod";

export const CreateOrgSchema = z.object({ name: z.string().min(1).max(120) });
export const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});
export const AcceptInviteSchema = z.object({ token: z.string().min(10) });
export const CreateGroupSchema = z.object({ name: z.string().min(1).max(120) });
export const AddMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]).default("MEMBER"),
});
export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  completionMode: z.enum(["ANY", "ALL"]).default("ANY"),
  maxAssignees: z.number().int().positive().optional(),
  allowClaim: z.boolean().default(true),
  assigneeIds: z.array(z.string().uuid()).optional(),
  dueDate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
    .optional(),
});
export const AssignTaskSchema = z.object({ userId: z.string().uuid() });
export const PatchTaskSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).nullable().optional(),
  dueDate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
    .optional(),
});
