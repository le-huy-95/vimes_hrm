/**
 * GithubTeamController — HTTP layer for GitHub App install + team connection.
 *
 * Cookie mirrors the Workspace connect pattern: signed state stored in an
 * httpOnly cookie, verified by the public install callback (no JWT).
 */
import type { Request, Response } from "express";
import { BaseController } from "./base.controller.js";
import type { GithubAppService } from "../services/github-app.service.js";
import {
  parseInstallState,
  verifyGithubInstallState,
} from "../services/github-app.service.js";
import type { GithubSyncService } from "../services/github-sync.service.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { env } from "../lib/env.js";
import { AppError } from "../lib/errors.js";
import { activityQuerySchema } from "../validators/github.validators.js";

export const GITHUB_INSTALL_STATE_COOKIE = "github_install_state";
const STATE_COOKIE_PATH = "/teams";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export class GithubTeamController extends BaseController {
  constructor(
    private readonly app: GithubAppService,
    private readonly sync: GithubSyncService,
  ) {
    super();
  }

  readonly getInstallUrl = this.bind(this.handleGetInstallUrl);
  readonly installCallback = this.bind(this.handleInstallCallback);
  readonly getConnection = this.bind(this.handleGetConnection);
  readonly deleteConnection = this.bind(this.handleDeleteConnection);
  readonly listRepos = this.bind(this.handleListRepos);
  readonly enqueueSync = this.bind(this.handleEnqueueSync);
  readonly listActivity = this.bind(this.handleListActivity);

  private teamId(req: Request): string {
    return String(req.params.teamId);
  }

  /** JWT: build install URL and stash signed state in a short-lived cookie. */
  private async handleGetInstallUrl(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const teamId = this.teamId(req);
    const { url, state } = this.app.buildInstallUrl(teamId, user.sub);
    res.cookie(GITHUB_INSTALL_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.COOKIE_SECURE,
      path: STATE_COOKIE_PATH,
      maxAge: STATE_MAX_AGE_MS,
    });
    this.ok(res, { url });
  }

  /**
   * Public install callback — GitHub redirects here without Authorization.
   * Verifies state + cookie, completes install, redirects to web app.
   */
  private async handleInstallCallback(req: Request, res: Response) {
    const fail = (reason: string, teamId?: string) => {
      const base = teamId
        ? `${env.WEB_ORIGIN}/teams/${teamId}?github=error&reason=${encodeURIComponent(reason)}`
        : `${env.WEB_ORIGIN}/teams?github=error&reason=${encodeURIComponent(reason)}`;
      res.redirect(base);
    };

    try {
      const state = String(req.query.state ?? "");
      const installationIdRaw = String(req.query.installation_id ?? "");
      if (!state || !installationIdRaw) {
        return fail("github_invalid");
      }

      const cookieState = req.cookies?.[GITHUB_INSTALL_STATE_COOKIE] as
        | string
        | undefined;
      if (!cookieState || cookieState !== state) {
        return fail("github_state");
      }

      const payload = verifyGithubInstallState(state);
      const { teamId, userId } = parseInstallState(payload);
      const installationId = BigInt(installationIdRaw);

      res.clearCookie(GITHUB_INSTALL_STATE_COOKIE, {
        path: STATE_COOKIE_PATH,
      });
      // completeInstall validates team.orgId against the acting user's org.
      await this.app.completeInstall({
        teamId,
        userId,
        orgId: await this.resolveOrgId(teamId),
        installationId,
      });
      res.redirect(`${env.WEB_ORIGIN}/teams/${teamId}?github=connected`);
    } catch (err) {
      console.error("GitHub install callback error:", err);
      const message =
        err instanceof AppError ? err.message : "github_install_failed";
      // Best-effort: extract teamId from state for a scoped redirect.
      let teamId: string | undefined;
      try {
        const s = String(req.query.state ?? "");
        if (s) teamId = parseInstallState(verifyGithubInstallState(s)).teamId;
      } catch {
        teamId = undefined;
      }
      fail(message, teamId);
    }
  }

  private async resolveOrgId(teamId: string): Promise<string> {
    const conn = await this.app.getConnection(teamId);
    if (conn) return conn.orgId;
    const { prisma } = await import("../lib/prisma.js");
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { orgId: true },
    });
    if (!team) throw new AppError(404, "Team not found");
    return team.orgId;
  }

  private async handleGetConnection(req: Request, res: Response) {
    const conn = await this.app.getConnection(this.teamId(req));
    if (!conn) throw new AppError(404, "GitHub connection not found");
    this.ok(res, conn);
  }

  private async handleDeleteConnection(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    await this.app.deleteConnection(this.teamId(req), user.sub);
    this.noContent(res);
  }

  private async handleListRepos(req: Request, res: Response) {
    const repos = await this.app.listRepos(this.teamId(req));
    this.ok(res, repos);
  }

  private async handleEnqueueSync(req: Request, res: Response) {
    const result = await this.sync.enqueueForTeam(this.teamId(req));
    res.status(202).json(result);
  }

  private async handleListActivity(req: Request, res: Response) {
    const query = activityQuerySchema.parse(req.query);
    const data = await this.app.listActivity(
      this.teamId(req),
      query.take,
      query.cursor,
    );
    this.ok(res, data);
  }
}
