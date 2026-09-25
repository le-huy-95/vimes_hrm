import type { Request, Response } from "express";
import { BaseController } from "./base.controller.js";
import type { ChatService } from "../services/chat.service.js";
import type { AuthedRequest } from "../middleware/auth.js";
import {
  createMessageBodySchema,
  messagesQuerySchema,
} from "../validators/chat.validators.js";

export class ChatController extends BaseController {
  constructor(private readonly chat: ChatService) {
    super();
  }

  readonly listChannels = this.bind(this.handleListChannels);
  readonly listMessages = this.bind(this.handleListMessages);
  readonly createMessage = this.bind(this.handleCreateMessage);

  private async handleListChannels(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const data = await this.chat.listChannels(
      String(req.params.teamId),
      user.sub,
      user.orgId,
    );
    this.ok(res, data);
  }

  private async handleListMessages(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const query = messagesQuerySchema.parse(req.query);
    const data = await this.chat.listMessages(
      String(req.params.teamId),
      String(req.params.channelId),
      user.sub,
      user.orgId,
      query,
    );
    this.ok(res, data);
  }

  private async handleCreateMessage(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const body = createMessageBodySchema.parse(req.body);
    const message = await this.chat.createMessage({
      teamId: String(req.params.teamId),
      channelId: String(req.params.channelId),
      userId: user.sub,
      orgId: user.orgId,
      content: body.content,
      attachmentFileId: body.attachmentFileId,
      replyToId: body.replyToId,
    });
    this.created(res, message);
  }
}
