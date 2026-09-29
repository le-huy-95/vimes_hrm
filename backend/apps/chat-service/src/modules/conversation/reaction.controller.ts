import type { Request, Response } from "express";
import type { Server as SocketServer } from "socket.io";
import { createLogger, requireUser, sendError } from "@manage-teams/lib";
import { z } from "zod";
import * as reactionService from "./reaction.service.js";

const logger = createLogger("chat-service");

let ioRef: SocketServer | undefined;

/** Gắn Socket.IO từ conversation bootstrap. */
export function setReactionSocketServer(io: SocketServer): void {
  ioRef = io;
}

const ReactionSchema = z.object({
  emoji: z.string().min(1).max(32),
});

/** POST /conversations/:id/messages/:messageId/reactions */
export async function toggleReaction(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const body = ReactionSchema.parse(req.body);
    const conversationId = String(req.params.id);
    const messageId = String(req.params.messageId);
    const result = await reactionService.toggleReaction({
      userId: user.id,
      conversationId,
      messageId,
      emoji: body.emoji,
    });
    ioRef?.to(`conv:${conversationId}`).emit("reaction:changed", {
      conversationId,
      messageId,
      userId: user.id,
      ...result,
    });
    res.json(result);
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** GET /conversations/:id/messages/:messageId/reactions */
export async function listReactions(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    res.json(
      await reactionService.listReactions(
        String(req.params.id),
        String(req.params.messageId),
        user.id,
      ),
    );
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** GET /conversations/:id/search?q=&groupId=&taskId= */
export async function search(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const q = String(req.query.q ?? "");
    res.json(
      await reactionService.searchMessages({
        userId: user.id,
        conversationId: String(req.params.id),
        q,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        groupId: req.query.groupId ? String(req.query.groupId) : undefined,
        taskId: req.query.taskId ? String(req.query.taskId) : undefined,
      }),
    );
  } catch (err) {
    sendError(res, err, logger);
  }
}
