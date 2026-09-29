import type { Request, Response } from "express";
import { createLogger, requireUser, sendError } from "@manage-teams/lib";
import { AcceptInviteSchema, CreateOrgSchema, InviteSchema } from "../_shared/core.schemas.js";
import * as orgService from "./org.service.js";

const logger = createLogger("core-service");

export async function createOrg(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const body = CreateOrgSchema.parse(req.body);
    const organization = await orgService.createOrg(user.id, body.name);
    res.status(201).json({ organization: { id: organization.id, name: organization.name } });
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function listOrgs(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const organizations = await orgService.listOrgs(user.id);
    res.json({ organizations });
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function invite(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const orgId = req.params.orgId as string;
    const body = InviteSchema.parse(req.body);
    const { expiresAt } = await orgService.inviteToOrg(orgId, user.id, body.email, body.role);
    res.status(201).json({
      ok: true,
      expiresAt,
      message: "Đã gửi lời mời tổ chức trên Vimes.",
    });
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function acceptInvite(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const body = AcceptInviteSchema.parse(req.body);
    const { organizationId } = await orgService.acceptOrgInvite(body.token, user.id, user.email);
    res.json({ ok: true, organizationId });
  } catch (err) {
    sendError(res, err, logger);
  }
}
