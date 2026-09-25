import { BaseRepository } from "./base.repository.js";

export type RepoUpsertRow = {
  teamId: string;
  connectionId: string;
  githubRepoId: bigint;
  fullName: string;
  defaultBranch?: string | null;
  private?: boolean;
  htmlUrl: string;
};

const CHUNK = 100;

export class GithubRepoRepository extends BaseRepository {
  listByTeam(teamId: string) {
    return this.db.githubRepo.findMany({
      where: { teamId },
      orderBy: { fullName: "asc" },
    });
  }

  findByTeamAndGithubId(teamId: string, githubRepoId: bigint) {
    return this.db.githubRepo.findUnique({
      where: { teamId_githubRepoId: { teamId, githubRepoId } },
    });
  }

  async bulkUpsert(rows: RepoUpsertRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    let touched = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const results = await Promise.all(
        chunk.map((r) =>
          this.db.githubRepo.upsert({
            where: { teamId_githubRepoId: { teamId: r.teamId, githubRepoId: r.githubRepoId } },
            create: {
              teamId: r.teamId,
              connectionId: r.connectionId,
              githubRepoId: r.githubRepoId,
              fullName: r.fullName,
              defaultBranch: r.defaultBranch ?? null,
              private: r.private ?? false,
              htmlUrl: r.htmlUrl,
              lastSyncedAt: new Date(),
            },
            update: {
              connectionId: r.connectionId,
              fullName: r.fullName,
              defaultBranch: r.defaultBranch ?? null,
              private: r.private ?? false,
              htmlUrl: r.htmlUrl,
              lastSyncedAt: new Date(),
            },
          }),
        ),
      );
      touched += results.length;
    }
    return touched;
  }

  deleteByGithubRepoIds(teamId: string, githubRepoIds: bigint[]) {
    if (githubRepoIds.length === 0) return Promise.resolve({ count: 0 });
    return this.db.githubRepo.deleteMany({
      where: { teamId, githubRepoId: { in: githubRepoIds } },
    });
  }
}
