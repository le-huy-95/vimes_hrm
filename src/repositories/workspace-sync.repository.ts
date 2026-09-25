import { BaseRepository } from "./base.repository.js";

export type WorkspaceSyncRow = {
  orgId: string;
  googleUserId: string;
  primaryEmail: string;
  fullName: string;
  orgUnit?: string | null;
  photoUrl?: string | null;
  suspended: boolean;
  linkedUserId?: string | null;
  contentHash: string;
  lastSyncedAt: Date;
};

const CHUNK = 200;

export class WorkspaceSyncRepository extends BaseRepository {
  async bulkUpsert(rows: WorkspaceSyncRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    let touched = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const results = await Promise.all(
        chunk.map((r) =>
          this.db.googleWorkspaceSync.upsert({
            where: { orgId_googleUserId: { orgId: r.orgId, googleUserId: r.googleUserId } },
            create: {
              orgId: r.orgId,
              googleUserId: r.googleUserId,
              primaryEmail: r.primaryEmail,
              fullName: r.fullName,
              orgUnit: r.orgUnit ?? null,
              photoUrl: r.photoUrl ?? null,
              suspended: r.suspended,
              linkedUserId: r.linkedUserId ?? null,
              contentHash: r.contentHash,
              lastSyncedAt: r.lastSyncedAt,
            },
            update: {
              primaryEmail: r.primaryEmail,
              fullName: r.fullName,
              orgUnit: r.orgUnit ?? null,
              photoUrl: r.photoUrl ?? null,
              suspended: r.suspended,
              ...(r.linkedUserId !== undefined ? { linkedUserId: r.linkedUserId } : {}),
              contentHash: r.contentHash,
              lastSyncedAt: r.lastSyncedAt,
            },
          }),
        ),
      );
      touched += results.length;
    }
    return touched;
  }

  listByOrg(orgId: string, opts: { cursor?: string; take?: number } = {}) {
    const take = Math.min(opts.take ?? 100, 500);
    return this.db.googleWorkspaceSync.findMany({
      where: { orgId },
      orderBy: [{ primaryEmail: "asc" }, { id: "asc" }],
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      take,
    });
  }

  findByGoogleUserIds(orgId: string, googleUserIds: string[]) {
    if (googleUserIds.length === 0) return Promise.resolve([]);
    return this.db.googleWorkspaceSync.findMany({
      where: { orgId, googleUserId: { in: googleUserIds } },
    });
  }
}
