import type { Request, Response } from "express";
import { AppError, createLogger, requireUser, sendError } from "@manage-teams/lib";
import { z } from "zod";
import * as aiService from "./ai.service.js";
import * as adminService from "./admin.service.js";
import * as semanticService from "./semantic.service.js";

const logger = createLogger("ai-service");
const internalToken = process.env.INTERNAL_SERVICE_TOKEN ?? "dev-internal-token";

const ChatSchema = z.object({
  message: z.string().min(1).max(4000),
  sessionId: z.string().uuid().optional(),
});

const IndexSchema = z.object({
  messageId: z.string().uuid(),
  groupId: z.string().uuid().nullable().optional(),
  text: z.string().min(1).max(8000),
});

const BotAskSchema = z.object({
  userId: z.string().uuid(),
  message: z.string().min(1).max(4000),
});

/** Echo ping — kiểm tra proxy. */
export async function ping(req: Request, res: Response): Promise<void> {
  try {
    res.json({ ok: true, echo: req.body ?? null, service: "ai-service" });
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /ai/chat — 6a/6c read-only. */
export async function chat(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const body = ChatSchema.parse(req.body);
    res.json(await aiService.runChat({ userId: user.id, ...body }));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /ai/chat/stream — SSE stub. */
export async function chatStream(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const body = ChatSchema.parse(req.body);
    const result = await aiService.runChat({ userId: user.id, ...body });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.write(
      `event: meta\ndata: ${JSON.stringify({ sessionId: result.sessionId, mock: result.mock, provider: result.provider })}\n\n`,
    );
    res.write(`event: token\ndata: ${JSON.stringify({ text: result.answer })}\n\n`);
    res.write(`event: links\ndata: ${JSON.stringify({ links: result.links })}\n\n`);
    res.write(`event: done\ndata: {}\n\n`);
    res.end();
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** GET /ai/admin/ops — 6d. */
export async function adminOps(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    adminService.assertPlatformAdmin(user.id);
    res.json(await adminService.getOpsSnapshot());
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /internal/ai/index-message — 6c indexer stub. */
export async function indexMessage(req: Request, res: Response): Promise<void> {
  try {
    if (req.header("x-internal-token") !== internalToken) {
      throw new AppError("Unauthorized", "UNAUTHORIZED", 401);
    }
    const body = IndexSchema.parse(req.body);
    await semanticService.indexMessageEmbedding({
      messageId: body.messageId,
      groupId: body.groupId ?? null,
      text: body.text,
    });
    res.status(202).json({ ok: true });
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /internal/ai/bot-ask — 6e Google Chat @bot. */
export async function botAsk(req: Request, res: Response): Promise<void> {
  try {
    if (req.header("x-internal-token") !== internalToken) {
      throw new AppError("Unauthorized", "UNAUTHORIZED", 401);
    }
    const body = BotAskSchema.parse(req.body);
    res.json(await aiService.runChat({ userId: body.userId, message: body.message }));
  } catch (err) {
    sendError(res, err, logger);
  }
}
