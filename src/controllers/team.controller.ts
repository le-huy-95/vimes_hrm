/**
 * TeamController — HTTP layer cho team & thành viên.
 * Parse params/body rồi ủy quyền toàn bộ nghiệp vụ cho TeamService.
 */
import type { Request, Response } from "express";
import { TeamRole } from "@prisma/client";
import { BaseController } from "./base.controller.js";
import type { TeamService } from "../services/team.service.js";
import type { AuthedRequest } from "../middleware/auth.js";
import {
  addMemberBodySchema,
  createTeamBodySchema,
  updateMemberRoleBodySchema,
  updateTeamBodySchema,
} from "../validators/team.validators.js";

export class TeamController extends BaseController {
  constructor(private readonly teamService: TeamService) {
    super();
  }

  readonly list = this.bind(this.handleList);
  readonly create = this.bind(this.handleCreate);
  readonly getOne = this.bind(this.handleGetOne);
  readonly update = this.bind(this.handleUpdate);
  readonly remove = this.bind(this.handleRemove);
  readonly listMembers = this.bind(this.handleListMembers);
  readonly addMember = this.bind(this.handleAddMember);
  readonly updateMemberRole = this.bind(this.handleUpdateMemberRole);
  readonly removeMember = this.bind(this.handleRemoveMember);

  /** Chuẩn hóa param Express (có thể là string | string[]) thành string */
  private teamId(req: Request): string {
    return String(req.params.teamId);
  }

  private userIdParam(req: Request): string {
    return String(req.params.userId);
  }

  /** ?as=tree → cây phân cấp; mặc định danh sách phẳng */
  private async handleList(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const asTree = req.query.as === "tree";
    const data = await this.teamService.listTeams(user.orgId, asTree);
    this.ok(res, data);
  }

  private async handleCreate(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const body = createTeamBodySchema.parse(req.body);
    const team = await this.teamService.createTeam(user.sub, user.orgId, body);
    this.created(res, team);
  }

  private async handleGetOne(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const team = await this.teamService.getTeam(user.orgId, this.teamId(req));
    this.ok(res, team);
  }

  private async handleUpdate(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const body = updateTeamBodySchema.parse(req.body);
    const team = await this.teamService.updateTeam(
      user.sub,
      user.orgId,
      this.teamId(req),
      body,
    );
    this.ok(res, team);
  }

  private async handleRemove(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    await this.teamService.deleteTeam(user.sub, user.orgId, this.teamId(req));
    this.noContent(res);
  }

  private async handleListMembers(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const members = await this.teamService.listMembers(
      user.orgId,
      this.teamId(req),
    );
    this.ok(res, members);
  }

  private async handleAddMember(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const body = addMemberBodySchema.parse(req.body);
    const member = await this.teamService.addMember(
      user.sub,
      user.orgId,
      this.teamId(req),
      {
        email: body.email,
        role: body.role as TeamRole,
      },
    );
    this.created(res, member);
  }

  private async handleUpdateMemberRole(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const body = updateMemberRoleBodySchema.parse(req.body);
    const member = await this.teamService.updateMemberRole(
      user.sub,
      user.orgId,
      this.teamId(req),
      this.userIdParam(req),
      body.role as TeamRole,
    );
    this.ok(res, member);
  }

  private async handleRemoveMember(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    await this.teamService.removeMember(
      user.sub,
      user.orgId,
      this.teamId(req),
      this.userIdParam(req),
    );
    this.noContent(res);
  }
}
