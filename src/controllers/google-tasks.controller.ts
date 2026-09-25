import type { Request, Response } from "express";
import { z } from "zod";
import { BaseController } from "./base.controller.js";
import type { GoogleTasksService } from "../services/google-tasks.service.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { env } from "../lib/env.js";

const bindBodySchema = z.object({
  todoListId: z.string().min(1).nullable().optional(),
  doingListId: z.string().min(1).nullable().optional(),
  doneListId: z.string().min(1).nullable().optional(),
});

export class GoogleTasksController extends BaseController {
  constructor(private readonly googleTasks: GoogleTasksService) {
    super();
  }

  readonly status = this.bind(this.handleStatus);
  readonly connectStart = this.bind(this.handleConnectStart);
  readonly connectCallback = this.bind(this.handleConnectCallback);
  readonly listRemote = this.bind(this.handleListRemote);
  readonly bindLists = this.bind(this.handleBind);
  readonly sync = this.bind(this.handleSync);

  private teamId(req: Request) {
    return String(req.params.teamId);
  }

  private async handleStatus(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const data = await this.googleTasks.getStatus(
      user.orgId,
      this.teamId(req),
      user.sub,
    );
    this.ok(res, data);
  }

  private async handleConnectStart(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const url = this.googleTasks.buildConnectUrl(this.teamId(req), user.sub);
    this.ok(res, { url });
  }

  private async handleConnectCallback(req: Request, res: Response) {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!code || !state) {
      res.redirect(`${env.WEB_ORIGIN}/?google_tasks=missing_code`);
      return;
    }
    try {
      const { teamId } = await this.googleTasks.handleConnectCallback(
        code,
        state,
      );
      res.redirect(
        `${env.WEB_ORIGIN}/teams/${teamId}?google_tasks=connected`,
      );
    } catch {
      res.redirect(`${env.WEB_ORIGIN}/?google_tasks=failed`);
    }
  }

  private async handleListRemote(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const lists = await this.googleTasks.listRemoteLists(
      user.orgId,
      this.teamId(req),
      user.sub,
    );
    this.ok(res, lists);
  }

  private async handleBind(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const body = bindBodySchema.parse(req.body);
    const settings = await this.googleTasks.bindLists(
      user.sub,
      user.orgId,
      this.teamId(req),
      body,
    );
    this.ok(res, settings);
  }

  private async handleSync(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const data = await this.googleTasks.enqueueSync(
      user.orgId,
      this.teamId(req),
      user.sub,
    );
    this.ok(res, data);
  }
}
