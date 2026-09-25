import type { Request, Response } from "express";
import { BaseController } from "./base.controller.js";
import type { TaskService } from "../services/task.service.js";
import type { AuthedRequest } from "../middleware/auth.js";
import {
  createCommentBodySchema,
  createTaskBodySchema,
  updateTaskBodySchema,
} from "../validators/task.validators.js";

export class TaskController extends BaseController {
  constructor(private readonly tasks: TaskService) {
    super();
  }

  readonly list = this.bind(this.handleList);
  readonly create = this.bind(this.handleCreate);
  readonly getOne = this.bind(this.handleGetOne);
  readonly update = this.bind(this.handleUpdate);
  readonly remove = this.bind(this.handleRemove);
  readonly listComments = this.bind(this.handleListComments);
  readonly addComment = this.bind(this.handleAddComment);
  readonly removeComment = this.bind(this.handleRemoveComment);

  private async handleList(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const data = await this.tasks.listTasks(
      user.orgId,
      String(req.params.teamId),
      String(req.params.projectId),
    );
    this.ok(res, data);
  }

  private async handleCreate(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const body = createTaskBodySchema.parse(req.body);
    const task = await this.tasks.createTask(
      user.sub,
      user.orgId,
      String(req.params.teamId),
      String(req.params.projectId),
      body,
    );
    this.created(res, task);
  }

  private async handleGetOne(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const task = await this.tasks.getTask(
      user.orgId,
      String(req.params.teamId),
      String(req.params.taskId),
    );
    this.ok(res, task);
  }

  private async handleUpdate(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const body = updateTaskBodySchema.parse(req.body);
    const task = await this.tasks.updateTask(
      user.sub,
      user.orgId,
      String(req.params.teamId),
      String(req.params.taskId),
      body,
    );
    this.ok(res, task);
  }

  private async handleRemove(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    await this.tasks.deleteTask(
      user.sub,
      user.orgId,
      String(req.params.teamId),
      String(req.params.taskId),
    );
    this.noContent(res);
  }

  private async handleListComments(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const data = await this.tasks.listComments(
      user.orgId,
      String(req.params.teamId),
      String(req.params.taskId),
    );
    this.ok(res, data);
  }

  private async handleAddComment(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const body = createCommentBodySchema.parse(req.body);
    const comment = await this.tasks.addComment(
      user.sub,
      user.orgId,
      String(req.params.teamId),
      String(req.params.taskId),
      body.content,
    );
    this.created(res, comment);
  }

  private async handleRemoveComment(req: Request, res: Response) {
    const authed = req as AuthedRequest & { teamRole?: string };
    const isManager = authed.teamRole === "lead";
    await this.tasks.deleteComment(
      authed.user.sub,
      authed.user.orgId,
      String(req.params.teamId),
      String(req.params.taskId),
      String(req.params.commentId),
      isManager,
    );
    this.noContent(res);
  }
}
