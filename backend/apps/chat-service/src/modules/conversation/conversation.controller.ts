import type { Request, Response } from "express";
import type { Server as SocketServer } from "socket.io";
import { createLogger, requireUser, sendError } from "@manage-teams/lib";
import { chatSendRateLimit } from "../../middlewares/rate-limit.js";
import * as conversationService from "./conversation.service.js";
import { setReactionSocketServer } from "./reaction.controller.js";
import {
  EnsureGroupSchema,
  EnsureGroupPublicSchema,
  EnsureDmPublicSchema,
  EnsureTaskSchema,
  EditMessageSchema,
  IngestExternalSchema,
  MarkReadSchema,
  PostMessageSchema,
  RemoveMemberSchema,
} from "./conversation.schemas.js";

const logger = createLogger("chat-service");

let ioRef: SocketServer | undefined;

/** Gắn Socket.IO server để emit sau khi ghi DB. */
export function setSocketServer(io: SocketServer): void {
  ioRef = io;
  setReactionSocketServer(io);
}

/** Internal: đảm bảo conversation group. */
export async function ensureGroup(req: Request, res: Response): Promise<void> {
  try {
    conversationService.requireInternal(req.header("x-internal-token") ?? undefined);
    const body = EnsureGroupSchema.parse(req.body);
    res.json(await conversationService.ensureGroupConversation(body.groupId, body.memberIds));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** Internal: đảm bảo conversation task thread. */
export async function ensureTask(req: Request, res: Response): Promise<void> {
  try {
    conversationService.requireInternal(req.header("x-internal-token") ?? undefined);
    const body = EnsureTaskSchema.parse(req.body);
    res.json(await conversationService.ensureTaskConversation(body));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /conversations/ensure-group — JWT user. */
export async function ensureGroupPublic(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const body = EnsureGroupPublicSchema.parse(req.body);
    res.json(await conversationService.ensureGroupConversationForUser(user.id, body.groupId));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /conversations/ensure-dm — JWT user. */
export async function ensureDmPublic(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const body = EnsureDmPublicSchema.parse(req.body);
    res.json(
      await conversationService.ensureDmConversationForUser(
        user.id,
        body.groupId,
        body.peerUserId,
      ),
    );
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** Internal: gỡ member khỏi chat group. */
export async function removeMember(req: Request, res: Response): Promise<void> {
  try {
    conversationService.requireInternal(req.header("x-internal-token") ?? undefined);
    const body = RemoveMemberSchema.parse(req.body);
    res.json(await conversationService.removeMemberFromGroupChats(body.groupId, body.userId));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** Internal: ingest tin Google Chat (Phase 3.5). */
export async function ingestExternal(req: Request, res: Response): Promise<void> {
  try {
    conversationService.requireInternal(req.header("x-internal-token") ?? undefined);
    const body = IngestExternalSchema.parse(req.body);
    const result = await conversationService.ingestExternalMessage(body);
    res.status(result.status).json(result);
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** GET /conversations */
export async function listConversations(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    res.json(await conversationService.listConversations(user.id));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** GET /conversations/:id/messages?after_seq= */
export async function listMessages(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const conversationId = String(req.params.id);
    const afterSeq = Number(req.query.after_seq ?? 0);
    res.json(await conversationService.listMessages(user.id, conversationId, afterSeq));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /conversations/:id/messages — có rate-limit. */
export async function postMessage(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    (req as { userId?: string }).userId = user.id;
    await new Promise<void>((resolve, reject) => {
      chatSendRateLimit()(req, res, (err?: unknown) => (err ? reject(err) : resolve()));
    });
    const conversationId = String(req.params.id);
    const body = PostMessageSchema.parse(req.body);
    const result = await conversationService.postMessage(user.id, conversationId, body, ioRef);
    res.status(result.status).json({ message: result.message });
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /conversations/:id/read — cập nhật last_read_seq. */
export async function markRead(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const conversationId = String(req.params.id);
    const body = MarkReadSchema.parse(req.body);
    res.json(await conversationService.markRead(user.id, conversationId, body.seq));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** PATCH /conversations/:id/messages/:messageId */
export async function editMessage(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const conversationId = String(req.params.id);
    const messageId = String(req.params.messageId);
    const body = EditMessageSchema.parse(req.body);
    res.json(
      await conversationService.editMessage(user.id, conversationId, messageId, body.body, ioRef),
    );
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** DELETE /conversations/:id/messages/:messageId */
export async function deleteMessage(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const conversationId = String(req.params.id);
    const messageId = String(req.params.messageId);
    res.json(
      await conversationService.deleteMessage(user.id, conversationId, messageId, ioRef),
    );
  } catch (err) {
    sendError(res, err, logger);
  }
}
