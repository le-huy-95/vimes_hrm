import type { Request, Response } from "express";
import { createLogger, requireUser, sendError } from "@manage-teams/lib";
import { z } from "zod";
import * as fileService from "./file.service.js";

const logger = createLogger("chat-service");

const InitSchema = z.object({
  conversationId: z.string().uuid(),
  originalName: z.string().min(1).max(255),
  contentType: z.string().max(128).optional(),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().length(64).optional(),
});

const CompleteSchema = z.object({
  sha256: z.string().length(64).optional(),
});

/** POST /files/init */
export async function initUpload(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const body = InitSchema.parse(req.body);
    res.status(201).json(await fileService.initFileUpload({ userId: user.id, ...body }));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /files/:id/complete */
export async function completeUpload(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const body = CompleteSchema.parse(req.body ?? {});
    res.json(
      await fileService.completeFileUpload({
        userId: user.id,
        fileId: String(req.params.id),
        sha256: body.sha256,
      }),
    );
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** GET /files/:id/download — JSON { url } signed. */
export async function download(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    res.json(await fileService.getDownloadUrl(user.id, String(req.params.id)));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** GET /conversations/:id/files */
export async function listFiles(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    res.json(await fileService.listConversationFiles(user.id, String(req.params.id)));
  } catch (err) {
    sendError(res, err, logger);
  }
}
