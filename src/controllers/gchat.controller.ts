import type { Request, Response } from "express";
import { BaseController } from "./base.controller.js";
import type { GchatService } from "../services/gchat.service.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { z } from "zod";

const connectBody = z.object({
  googleSpaceId: z.string().min(1),
  displayName: z.string().min(1),
});

const sendBody = z.object({
  text: z.string().min(1).max(4000),
});

export class GchatController extends BaseController {
  constructor(private readonly gchat: GchatService) {
    super();
  }

  readonly listSpaces = this.bind(this.handleList);
  readonly connectSpace = this.bind(this.handleConnect);
  readonly sendMessage = this.bind(this.handleSend);

  private async handleList(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const data = await this.gchat.listSpaces(String(req.params.teamId), user.orgId);
    this.ok(res, data);
  }

  private async handleConnect(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const body = connectBody.parse(req.body);
    const space = await this.gchat.connectSpace({
      teamId: String(req.params.teamId),
      orgId: user.orgId,
      googleSpaceId: body.googleSpaceId,
      displayName: body.displayName,
    });
    this.created(res, space);
  }

  private async handleSend(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const body = sendBody.parse(req.body);
    const row = await this.gchat.sendFromApp({
      teamId: String(req.params.teamId),
      orgId: user.orgId,
      spaceId: String(req.params.spaceId),
      userId: user.sub,
      text: body.text,
    });
    this.created(res, row);
  }
}
