/**
 * WorkspaceSyncController — HTTP layer for Google Workspace connect + sync.
 */
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import { BaseController } from "./base.controller.js";
import type { WorkspaceAuthService } from "../services/workspace-auth.service.js";
import {
  signConnectState,
  verifyConnectState,
} from "../services/workspace-auth.service.js";
import type { WorkspaceSyncService } from "../services/workspace-sync.service.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { env } from "../lib/env.js";
import { AppError } from "../lib/errors.js";
import {
  listQuerySchema,
  mapGroupBodySchema,
} from "../validators/workspace.validators.js";

const STATE_COOKIE = "workspace_oauth_state";
const STATE_COOKIE_PATH = "/orgs";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export class WorkspaceSyncController extends BaseController {
  constructor(
    private readonly auth: WorkspaceAuthService,
    private readonly sync: WorkspaceSyncService,
  ) {
    super();
  }

  readonly authStatus = this.bind(this.handleAuthStatus);
  readonly connectStart = this.bind(this.handleConnectStart);
  readonly connectCallback = this.bind(this.handleConnectCallback);
  readonly enqueueSync = this.bind(this.handleEnqueueSync);
  readonly status = this.bind(this.handleStatus);
  readonly logs = this.bind(this.handleLogs);
  readonly syncedUsers = this.bind(this.handleSyncedUsers);
  readonly listGroups = this.bind(this.handleListGroups);
  readonly mapGroup = this.bind(this.handleMapGroup);
  readonly unmapGroup = this.bind(this.handleUnmapGroup);

  private async handleAuthStatus(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const status = await this.auth.getAuthStatus(user.orgId, user.sub);
    this.ok(res, status);
  }

  /** Start Workspace Admin OAuth (JWT). Cookie holds signed state with user/org. */
  private async handleConnectStart(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const payload = `${user.sub}:${user.orgId}:${randomBytes(8).toString("hex")}`;
    const state = signConnectState(payload);
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.COOKIE_SECURE,
      path: STATE_COOKIE_PATH,
      maxAge: STATE_MAX_AGE_MS,
    });
    res.redirect(this.auth.buildConnectUrl(state));
  }

  /**
   * Public OAuth callback — validates signed state + cookie (no JWT).
   * Redirects to web app on success/failure.
   */
  private async handleConnectCallback(req: Request, res: Response) {
    const fail = (reason: string) => {
      res.redirect(
        `${env.WEB_ORIGIN}/login?error=${encodeURIComponent(reason)}`,
      );
    };

    try {
      if (req.query.error) {
        return fail(String(req.query.error));
      }

      const code = String(req.query.code ?? "");
      const state = String(req.query.state ?? "");
      if (!code || !state) {
        return fail("oauth_invalid");
      }

      const cookieState = req.cookies?.[STATE_COOKIE] as string | undefined;
      if (!cookieState || cookieState !== state) {
        return fail("oauth_state");
      }

      const payload = verifyConnectState(state);
      const [userId, orgId] = payload.split(":");
      if (!userId || !orgId) {
        return fail("oauth_state");
      }

      res.clearCookie(STATE_COOKIE, { path: STATE_COOKIE_PATH });
      await this.auth.handleConnectCallback(code, orgId, userId);
      res.redirect(`${env.WEB_ORIGIN}/teams?workspace=connected`);
    } catch (err) {
      const message =
        err instanceof AppError
          ? err.message
          : err instanceof ZodError
            ? "oauth_invalid"
            : "oauth_failed";
      console.error("Workspace connect callback error:", err);
      fail(message);
    }
  }

  private async handleEnqueueSync(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    await this.requireCanSync(user.orgId, user.sub);
    await this.sync.enqueueSync(user.orgId, user.sub);
    res.status(202).json({ queued: true });
  }

  private async handleStatus(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const status = await this.sync.getStatus(user.orgId);
    this.ok(res, status);
  }

  private async handleLogs(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const query = listQuerySchema.parse(req.query);
    const logs = await this.sync.listLogs(user.orgId, query.take, query.skip);
    this.ok(res, logs);
  }

  private async handleSyncedUsers(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const query = listQuerySchema.parse(req.query);
    const users = await this.sync.listSyncedUsers(
      user.orgId,
      query.cursor,
      query.take,
    );
    this.ok(res, users);
  }

  private async handleListGroups(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const groups = await this.sync.listGroups(user.orgId, user.sub);
    this.ok(res, groups);
  }

  private async handleMapGroup(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    await this.requireCanSync(user.orgId, user.sub);
    const groupEmail = decodeURIComponent(String(req.params.groupEmail ?? ""));
    const body = mapGroupBodySchema.parse(req.body);
    const mapped = await this.sync.mapGroupToTeam(
      user.orgId,
      groupEmail,
      body.teamId,
    );
    this.ok(res, mapped);
  }

  private async handleUnmapGroup(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    await this.requireCanSync(user.orgId, user.sub);
    const groupEmail = decodeURIComponent(String(req.params.groupEmail ?? ""));
    await this.sync.unmapGroup(user.orgId, groupEmail);
    this.noContent(res);
  }

  private async requireCanSync(orgId: string, userId: string) {
    const status = await this.auth.getAuthStatus(orgId, userId);
    if (!status.canSync) {
      throw new AppError(
        503,
        "Workspace not connected (Connect Workspace Admin or configure SA)",
      );
    }
  }
}
