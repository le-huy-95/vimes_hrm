import { z } from "zod";

export const createTaskBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeId: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]).default("todo"),
  dueDate: z.string().datetime().optional(),
  githubIssueUrl: z.string().url().optional(),
});

export const updateTaskBodySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  githubIssueUrl: z.string().url().nullable().optional(),
});

export const createCommentBodySchema = z.object({
  content: z.string().min(1),
});
