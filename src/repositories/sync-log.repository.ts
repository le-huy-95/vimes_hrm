import type { Prisma, SyncLogStatus } from "@prisma/client";
import { BaseRepository } from "./base.repository.js";

export class SyncLogRepository extends BaseRepository {
  createRunning(orgId: string, entityType = "directory_users") {
    return this.db.syncLog.create({
      data: { orgId, entityType, status: "running", provider: "google_workspace" },
    });
  }

  finish(id: string, status: SyncLogStatus, meta?: Prisma.InputJsonValue, errorMessage?: string) {
    return this.db.syncLog.update({
      where: { id },
      data: {
        status,
        ...(meta !== undefined ? { meta: meta ?? undefined } : {}),
        errorMessage: errorMessage ?? null,
      },
    });
  }

  listByOrg(orgId: string, opts: { take?: number; skip?: number } = {}) {
    return this.db.syncLog.findMany({
      where: { orgId },
      orderBy: { runAt: "desc" },
      take: opts.take ?? 50,
      skip: opts.skip ?? 0,
    });
  }

  latest(orgId: string) {
    return this.db.syncLog.findFirst({
      where: { orgId },
      orderBy: { runAt: "desc" },
    });
  }
}
