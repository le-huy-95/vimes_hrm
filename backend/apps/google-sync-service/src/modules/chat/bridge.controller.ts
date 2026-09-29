import type { Request, Response } from "express";
import { createLogger, sendError, AppError } from "@manage-teams/lib";
import { z } from "zod";
import {
  ingestGoogleChatMessage,
  renewExpiringWatches,
  registerChatSpace,
  egressAppMessageToGoogleChat,
} from "./bridge.service.js";

const logger = createLogger("google-sync-service");
const internalToken = process.env.INTERNAL_SERVICE_TOKEN ?? "dev-internal-token";

function requireInternal(req: Request): void {
  if (req.header("x-internal-token") !== internalToken) {
    throw new AppError("Unauthorized", "UNAUTHORIZED", 401);
  }
}

const IngestSchema = z.object({
  spaceName: z.string().min(3),
  googleMessageName: z.string().min(3),
  googleUpdateTime: z.string().optional(),
  body: z.string().max(8000),
  senderUserId: z.string().uuid(),
  conversationId: z.string().uuid(),
  groupId: z.string().uuid().optional(),
});

const RegisterSchema = z.object({
  spaceName: z.string().min(3),
  groupId: z.string().uuid(),
  conversationId: z.string().uuid(),
  chatIngestEnabled: z.boolean().optional(),
});

const EgressSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  body: z.string().max(8000),
  origin: z.string().optional(),
});

/** POST /internal/google-chat/ingest */
export async function ingest(req: Request, res: Response): Promise<void> {
  try {
    requireInternal(req);
    const body = IngestSchema.parse(req.body);
    res.json(await ingestGoogleChatMessage(body));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /internal/google-chat/spaces/register */
export async function registerSpace(req: Request, res: Response): Promise<void> {
  try {
    requireInternal(req);
    const body = RegisterSchema.parse(req.body);
    res.status(201).json(await registerChatSpace(body));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /internal/google-chat/egress — app → Google Chat */
export async function egress(req: Request, res: Response): Promise<void> {
  try {
    requireInternal(req);
    const body = EgressSchema.parse(req.body);
    res.json(await egressAppMessageToGoogleChat(body));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /internal/google-chat/watch/renew */
export async function renewWatches(req: Request, res: Response): Promise<void> {
  try {
    requireInternal(req);
    res.json(await renewExpiringWatches());
  } catch (err) {
    sendError(res, err, logger);
  }
}
