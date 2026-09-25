import { acquireLock, releaseLock } from "../lib/redis.js";
import { listInstallationRepos } from "../lib/github-app.js";
import { githubSyncReposQueue, githubSyncReposJobId } from "../lib/queue.js";
import { AppError } from "../lib/errors.js";
import type { GithubConnectionRepository } from "../repositories/github-connection.repository.js";
import type { GithubRepoRepository } from "../repositories/github-repo.repository.js";

export class GithubSyncService {
  constructor(
    private readonly connections: GithubConnectionRepository,
    private readonly repos: GithubRepoRepository,
  ) {}

  async enqueueForTeam(teamId: string) {
    const conn = await this.connections.findByTeamId(teamId);
    if (!conn) throw new AppError(404, "GitHub connection not found");
    const installationId = String(conn.installationId);
    await githubSyncReposQueue.add(
      "sync",
      { installationId, teamId },
      { jobId: githubSyncReposJobId(installationId) },
    );
    return { enqueued: true };
  }

  async runSync(installationId: string, teamId?: string) {
    const lockKey = `lock:github-sync:${installationId}`;
    const token = await acquireLock(lockKey, 300);
    if (!token) return { skipped: true as const, reason: "locked" };

    try {
      const conn = teamId
        ? await this.connections.findByTeamId(teamId)
        : await this.connections.findByInstallationId(BigInt(installationId));
      if (!conn) return { skipped: true as const, reason: "no_connection" };

      const remote = await listInstallationRepos(installationId);
      await this.repos.bulkUpsert(
        remote.map((r) => ({
          teamId: conn.teamId,
          connectionId: conn.id,
          githubRepoId: BigInt(r.id),
          fullName: r.full_name,
          defaultBranch: r.default_branch ?? null,
          private: r.private,
          htmlUrl: r.html_url,
        })),
      );
      return { skipped: false as const, synced: remote.length, teamId: conn.teamId };
    } finally {
      await releaseLock(lockKey, token);
    }
  }
}
