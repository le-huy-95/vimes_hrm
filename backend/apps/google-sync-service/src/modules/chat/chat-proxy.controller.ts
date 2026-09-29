import type { Request, Response } from "express";
import {
  AppError,
  createLogger,
  requireUser,
  sendError,
} from "@manage-teams/lib";
import { z } from "zod";
import {
  createLink,
  deleteLink,
  listLinksForGroup,
} from "./chat-links.service.js";
import {
  getReadiness,
  leaveLinkedSpaces,
  listMessages,
  listSpaces,
  sendMessage,
} from "./chat-proxy.service.js";

const logger = createLogger("google-sync-service");
const internalToken = process.env.INTERNAL_SERVICE_TOKEN ?? "dev-internal-token";

function requireInternal(req: Request): void {
  if (req.header("x-internal-token") !== internalToken) {
    throw new AppError("Chưa xác thực", "UNAUTHORIZED", 401);
  }
}

function decodeSpaceName(raw: string): string {
  return decodeURIComponent(raw);
}

const CreateLinkSchema = z.object({
  groupId: z.string().uuid(),
  spaceName: z.string().min(3),
  displayName: z.string().max(255).optional(),
  spaceType: z.string().max(64).optional(),
});

const SendMessageSchema = z.object({
  groupId: z.string().uuid(),
  text: z.string().min(1).max(8000),
});

const LeaveLinkedSchema = z.object({
  userId: z.string().uuid(),
  groupId: z.string().uuid(),
});

export async function readiness(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    res.json(await getReadiness(user.id));
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function listSpacesHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    res.json(await listSpaces(user.id));
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function listLinks(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const groupId = z.string().uuid().parse(req.query.groupId);
    const links = await listLinksForGroup(groupId, user.id);
    res.json({ links });
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function createLinkHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const body = CreateLinkSchema.parse(req.body);
    const link = await createLink({
      groupId: body.groupId,
      spaceName: body.spaceName,
      userId: user.id,
      displayName: body.displayName,
      spaceType: body.spaceType,
    });
    res.status(201).json({ link });
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function deleteLinkHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const id = z.string().uuid().parse(req.params.id);
    res.json(await deleteLink(id, user.id));
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function listMessagesHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const spaceName = decodeSpaceName(String(req.params.spaceName ?? ""));
    const groupId = z.string().uuid().parse(req.query.groupId);
    const pageToken =
      typeof req.query.pageToken === "string" ? req.query.pageToken : undefined;
    const result = await listMessages(user.id, groupId, spaceName, pageToken);
    res.json(result);
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function sendMessageHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const spaceName = decodeSpaceName(String(req.params.spaceName ?? ""));
    const body = SendMessageSchema.parse(req.body);
    const message = await sendMessage(user.id, body.groupId, spaceName, body.text);
    res.status(201).json({ message });
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function leaveLinkedInternal(req: Request, res: Response): Promise<void> {
  try {
    requireInternal(req);
    const body = LeaveLinkedSchema.parse(req.body);
    res.json(await leaveLinkedSpaces(body.userId, body.groupId));
  } catch (err) {
    sendError(res, err, logger);
  }
}
