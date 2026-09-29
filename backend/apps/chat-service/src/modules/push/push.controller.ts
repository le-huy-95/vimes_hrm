import type { Request, Response } from "express";
import { createLogger, requireUser, sendError } from "@manage-teams/lib";
import { z } from "zod";
import * as pushService from "./push.service.js";

const logger = createLogger("chat-service");

const UpsertSchema = z.object({
  platform: z.string().min(2).max(32),
  token: z.string().min(8).max(512),
});

const RemoveSchema = z.object({
  token: z.string().min(8).max(512),
});

/** POST /devices/push-token */
export async function upsertToken(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const body = UpsertSchema.parse(req.body);
    res.status(201).json(await pushService.upsertDeviceToken({ userId: user.id, ...body }));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** DELETE /devices/push-token */
export async function removeToken(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const body = RemoveSchema.parse(req.body ?? {});
    res.json(await pushService.removeDeviceToken(user.id, body.token));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** GET /devices/push-token */
export async function listTokens(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    res.json(await pushService.listDeviceTokens(user.id));
  } catch (err) {
    sendError(res, err, logger);
  }
}
