import type { Request, Response } from "express";
import { AppError, createLogger, requireUser, sendError } from "@manage-teams/lib";
import { z } from "zod";
import { AssignTaskSchema, CreateTaskSchema, PatchTaskSchema } from "../_shared/core.schemas.js";
import * as taskService from "./task.service.js";

const logger = createLogger("core-service");
const internalToken = process.env.INTERNAL_SERVICE_TOKEN ?? "dev-internal-token";

export async function createTask(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const groupId = req.params.groupId as string;
    const body = CreateTaskSchema.parse(req.body);
    const task = await taskService.createTask(groupId, user.id, body);
    res.status(201).json({
      task: {
        id: task.id,
        groupId: task.groupId,
        code: task.code,
        title: task.title,
        status: task.status,
      },
    });
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function listTasks(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const groupId = req.params.groupId as string;
    const tasks = await taskService.listTasks(groupId, user.id);
    res.json({ tasks });
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function getTask(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const { groupId, code } = req.params as { groupId: string; code: string };
    const task = await taskService.getTask(groupId, code, user.id);
    res.json({ task });
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function patchTask(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const { groupId, code } = req.params as { groupId: string; code: string };
    const body = PatchTaskSchema.parse(req.body);
    const task = await taskService.patchTask(groupId, code, user.id, body);
    res.json({ task });
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function claimTask(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const { groupId, code } = req.params as { groupId: string; code: string };
    const result = await taskService.claimTask(groupId, code, user.id);
    res
      .status(result.already ? 200 : 201)
      .json({ ok: true, taskId: result.taskId, claimed: !result.already });
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function completeTask(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const { groupId, code } = req.params as { groupId: string; code: string };
    await taskService.completeTask(groupId, code, user.id);
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /internal/tasks/complete — Google Chat / sync gọi (x-internal-token). */
export async function completeTaskInternal(req: Request, res: Response): Promise<void> {
  try {
    if (req.header("x-internal-token") !== internalToken) {
      throw new AppError("Unauthorized", "UNAUTHORIZED", 401);
    }
    const body = z
      .object({
        userId: z.string().uuid(),
        groupId: z.string().uuid(),
        code: z.string().min(1),
        source: z.enum(["user", "chat", "google"]).default("chat"),
      })
      .parse(req.body);
    await taskService.completeTask(body.groupId, body.code, body.userId, body.source);
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function assignTask(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const { groupId, code } = req.params as { groupId: string; code: string };
    const body = AssignTaskSchema.parse(req.body);
    await taskService.assignTask(groupId, code, user.id, body.userId);
    res.status(201).json({ ok: true });
  } catch (err) {
    sendError(res, err, logger);
  }
}
