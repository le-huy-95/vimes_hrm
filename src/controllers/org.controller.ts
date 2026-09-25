/**
 * OrgController — HTTP layer cho tổ chức của user đang đăng nhập.
 */
import type { Request, Response } from "express";
import { BaseController } from "./base.controller.js";
import type { OrgService } from "../services/org.service.js";
import type { AuthedRequest } from "../middleware/auth.js";
import {
  createOrgUserBodySchema,
  updateOrgBodySchema,
} from "../validators/org.validators.js";

export class OrgController extends BaseController {
  constructor(private readonly orgService: OrgService) {
    super();
  }

  readonly getMe = this.bind(this.handleGetMe);
  readonly updateMe = this.bind(this.handleUpdateMe);
  readonly createUser = this.bind(this.handleCreateUser);

  /** Lấy org gắn với JWT (user.orgId) */
  private async handleGetMe(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const org = await this.orgService.getMine(user.orgId);
    this.ok(res, org);
  }

  private async handleUpdateMe(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const body = updateOrgBodySchema.parse(req.body);
    const org = await this.orgService.updateMine(user.orgId, body);
    this.ok(res, org);
  }

  /** Thêm đồng nghiệp cùng org trước khi invite vào team */
  private async handleCreateUser(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const body = createOrgUserBodySchema.parse(req.body);
    const created = await this.orgService.createUser(
      user.sub,
      user.orgId,
      body,
    );
    this.created(res, created);
  }
}
