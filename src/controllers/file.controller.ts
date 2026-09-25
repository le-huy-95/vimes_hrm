import type { Request, Response } from "express";
import { BaseController } from "./base.controller.js";
import type { FileService } from "../services/file.service.js";
import type { AuthedRequest } from "../middleware/auth.js";
import {
  avatarBodySchema,
  confirmBodySchema,
  presignBodySchema,
  taskAttachmentBodySchema,
} from "../validators/file.validators.js";

export class FileController extends BaseController {
  constructor(private readonly fileService: FileService) {
    super();
  }

  readonly presign = this.bind(this.handlePresign);
  readonly confirm = this.bind(this.handleConfirm);
  readonly getFile = this.bind(this.handleGetFile);
  readonly setAvatar = this.bind(this.handleSetAvatar);
  readonly attachToTask = this.bind(this.handleAttachToTask);
  readonly listTaskAttachments = this.bind(this.handleListTaskAttachments);
  readonly detachFromTask = this.bind(this.handleDetachFromTask);

  private async handlePresign(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const body = presignBodySchema.parse(req.body);
    const data = await this.fileService.presign(user.sub, user.orgId, body);
    this.ok(res, data);
  }

  private async handleConfirm(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const body = confirmBodySchema.parse(req.body);
    const file = await this.fileService.confirm(user.sub, user.orgId, body);
    this.created(res, file);
  }

  private async handleGetFile(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const data = await this.fileService.getFile(user.orgId, String(req.params.fileId));
    this.ok(res, data);
  }

  private async handleSetAvatar(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const body = avatarBodySchema.parse(req.body);
    const file = await this.fileService.setAvatar(user.sub, user.orgId, body.fileId);
    this.ok(res, file);
  }

  private async handleAttachToTask(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const body = taskAttachmentBodySchema.parse(req.body);
    const row = await this.fileService.attachToTask(
      user.orgId,
      String(req.params.teamId),
      String(req.params.taskId),
      body.fileId,
    );
    this.created(res, row);
  }

  private async handleListTaskAttachments(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const rows = await this.fileService.listTaskAttachments(
      user.orgId,
      String(req.params.teamId),
      String(req.params.taskId),
    );
    this.ok(res, rows);
  }

  private async handleDetachFromTask(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    await this.fileService.detachFromTask(
      user.orgId,
      String(req.params.teamId),
      String(req.params.taskId),
      String(req.params.fileId),
    );
    this.noContent(res);
  }
}
