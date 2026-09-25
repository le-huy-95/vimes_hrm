import { z } from "zod";

export const createProjectBodySchema = z.object({
  name: z.string().min(1),
});

export const updateProjectBodySchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["active", "archived"]).optional(),
});
