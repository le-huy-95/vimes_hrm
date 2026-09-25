import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env, githubAppEnabled } from "../lib/env.js";
import { AppError } from "../lib/errors.js";
import { getInstallationAccount } from "../lib/github-app.js";
import { githubSyncReposQueue, githubSyncReposJobId } from "../lib/queue.js";
import type { GithubActivityRepository } from "../repositories/github-activity.repository.js";
import type { GithubConnectionRepository } from "../repositories/github-connection.repository.js";
import type { GithubRepoRepository } from "../repositories/github-repo.repository.js";
import type { TeamRepository } from "../repositories/team.repository.js";
import type { AuditRepository } from "../repositories/audit.repository.js";

/** HMAC-sign an install state payload (used as the GitHub OAuth `state`). */
export function signGithubInstallState(payload: string): string {
  const sig = createHmac("sha256", env.JWT_ACCESS_SECRET)
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

/** Verify + return the raw signed payload, or throw 400. */
export function verifyGithubInstallState(signed: string): string {
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) throw new AppError(400, "Invalid state");
  const payload = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = createHmac("sha256", env.JWT_ACCESS_SECRET)
    .update(payload)
    .digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError(400, "Invalid state");
  }
  return payload;
}

/** payload = `${teamId}:${userId}:${nonce}` */
export function parseInstallState(payload: string): {
  teamId: string;
  userId: string;
} {
  const [teamId, userId] = payload.split(":");
  if (!teamId || !userId) throw new AppError(400, "Invalid state payload");
  return { teamId, userId };
}

export class GithubAppService {
  constructor(
    private readonly connections: GithubConnectionRepository,
    private readonly repos: GithubRepoRepository,
    private readonly activity: GithubActivityRepository,
    private readonly teams: TeamRepository,
    private readonly audit: AuditRepository,
  ) {}

  assertConfigured() {
    if (!githubAppEnabled) {
      throw new AppError(503, "GitHub App is not configured");
    }
  }

  buildInstallUrl(teamId: string, userId: string): { url: string; state: string } {
    this.assertConfigured();
    const nonce = randomBytes(8).toString("hex");
    const state = signGithubInstallState(`${teamId}:${userId}:${nonce}`);
    const url = `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new?state=${encodeURIComponent(state)}`;
    return { url, state };
  }

  async completeInstall(input: {
    teamId: string;
    userId: string;
    orgId: string;
    installationId: bigint;
  }) {
    this.assertConfigured();
    const team = await this.teams.findById(input.teamId);
    if (!team || team.orgId !== input.orgId) {
      throw new AppError(404, "Team not found");
    }
    const account = await getInstallationAccount(String(input.installationId));
    const conn = await this.connections.upsertForTeam({
      teamId: input.teamId,
      orgId: input.orgId,
      installationId: input.installationId,
      githubAccountLogin: account.login,
      githubAccountType: account.type,
      connectedByUserId: input.userId,
    });
    await githubSyncReposQueue.add(
      "sync",
      { installationId: String(input.installationId), teamId: input.teamId },
      { jobId: githubSyncReposJobId(String(input.installationId)) },
    );
    await this.audit.create({
      actorUserId: input.userId,
      action: "github.connected",
      entityType: "team",
      entityId: input.teamId,
      meta: { installationId: String(input.installationId) },
    });
    return conn;
  }

  async getConnection(teamId: string) {
    const conn = await this.connections.findByTeamId(teamId);
    if (!conn) return null;
    return {
      ...conn,
      installationId: conn.installationId.toString(),
      githubTeamId: conn.githubTeamId ? conn.githubTeamId.toString() : null,
    };
  }

  async deleteConnection(teamId: string, actorUserId: string) {
    const existing = await this.connections.findByTeamId(teamId);
    if (!existing) throw new AppError(404, "GitHub connection not found");
    await this.connections.deleteByTeamId(teamId);
    await this.audit.create({
      actorUserId,
      action: "github.disconnected",
      entityType: "team",
      entityId: teamId,
    });
  }

  async listRepos(teamId: string) {
    const rows = await this.repos.listByTeam(teamId);
    return rows.map((r) => ({
      ...r,
      githubRepoId: r.githubRepoId.toString(),
    }));
  }

  async listActivity(teamId: string, take: number, cursor?: string) {
    // listByTeam already returns { items, nextCursor }; activity has no BigInt.
    return this.activity.listByTeam(teamId, take, cursor);
  }
}