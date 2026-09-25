import type { Request, Response } from "express";
import { BaseController } from "./base.controller.js";
import type { ProjectService } from "../services/project.service.js";
import type { AuthedRequest } from "../middleware/auth.js";
import {
  createProjectBodySchema,
  updateProjectBodySchema,
} from "../validators/project.validators.js";

export class ProjectController extends BaseController {
  constructor(private readonly projects: ProjectService) {
    super();
  }

  readonly list = this.bind(this.handleList);
  readonly create = this.bind(this.handleCreate);
  readonly getOne = this.bind(this.handleGetOne);
  readonly update = this.bind(this.handleUpdate);
  readonly remove = this.bind(this.handleRemove);

  private async handleList(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const data = await this.projects.listProjects(user.orgId, String(req.params.teamId));
    this.ok(res, data);
  }

  private async handleCreate(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const body = createProjectBodySchema.parse(req.body);
    const project = await this.projects.createProject(
      user.sub,
      user.orgId,
      String(req.params.teamId),
      body,
    );
    this.created(res, project);
  }

  private async handleGetOne(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const project = await this.projects.getProject(
      user.orgId,
      String(req.params.teamId),
      String(req.params.projectId),
    );
    this.ok(res, project);
  }

  private async handleUpdate(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const body = updateProjectBodySchema.parse(req.body);
    const project = await this.projects.updateProject(
      user.sub,
      user.orgId,
      String(req.params.teamId),
      String(req.params.projectId),
      body,
    );
    this.ok(res, project);
  }

  private async handleRemove(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    await this.projects.deleteProject(
      user.sub,
      user.orgId,
      String(req.params.teamId),
      String(req.params.projectId),
    );
    this.noContent(res);
  }
}
