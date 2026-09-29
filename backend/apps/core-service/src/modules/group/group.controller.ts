import type { Request, Response } from "express";
import { createLogger, requireUser, sendError } from "@manage-teams/lib";
import { AddMemberSchema, CreateGroupSchema } from "../_shared/core.schemas.js";
import * as groupService from "./group.service.js";

const logger = createLogger("core-service");

export async function createGroup(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const orgId = req.params.orgId as string;
    const body = CreateGroupSchema.parse(req.body);
    const group = await groupService.createGroup(orgId, user.id, body.name);
    res.status(201).json({
      group: { id: group.id, organizationId: group.organizationId, name: group.name },
    });
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function listGroups(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const orgId = req.params.orgId as string;
    const groups = await groupService.listGroups(orgId, user.id);
    res.json({ groups });
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function getGroup(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const groupId = req.params.groupId as string;
    const group = await groupService.getGroup(groupId, user.id);
    res.json({ group });
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function addMember(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const groupId = req.params.groupId as string;
    const body = AddMemberSchema.parse(req.body);
    const member = await groupService.addGroupMember(groupId, user.id, body.userId, body.role);
    res.status(201).json({ member });
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function removeMember(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const groupId = req.params.groupId as string;
    const targetUserId = req.params.userId as string;
    await groupService.removeGroupMember(groupId, user.id, targetUserId);
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, logger);
  }
}
