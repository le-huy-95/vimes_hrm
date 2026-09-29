import { prismaWrite } from "@manage-teams/db";
import { createLogger } from "@manage-teams/lib";

const logger = createLogger("google-sync-service");

/**
 * Phase 5: replay DLQ — đưa sync_jobs FAILED (và optionally AUTH_REQUIRED) về RETRY.
 */
export async function replayFailedSyncJobs(input: {
  limit?: number;
  includeAuthRequired?: boolean;
}): Promise<{ replayed: number; ids: string[] }> {
  const limit = Math.min(input.limit ?? 20, 100);
  const statuses = input.includeAuthRequired
    ? ["FAILED", "AUTH_REQUIRED"]
    : ["FAILED"];
  const jobs = await prismaWrite.syncJob.findMany({
    where: { status: { in: statuses } },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true },
  });
  const ids: string[] = [];
  for (const j of jobs) {
    await prismaWrite.syncJob.update({
      where: { id: j.id },
      data: {
        status: "RETRY",
        nextRunAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      },
    });
    ids.push(j.id);
  }
  logger.info({ count: ids.length, statuses }, "sync DLQ replayed");
  return { replayed: ids.length, ids };
}

/** Thống kê backlog sync_jobs cho /metrics. */
export async function syncJobBacklogCounts() {
  const [pending, retry, running, failed, authRequired, done] = await Promise.all([
    prismaWrite.syncJob.count({ where: { status: "PENDING" } }),
    prismaWrite.syncJob.count({ where: { status: "RETRY" } }),
    prismaWrite.syncJob.count({ where: { status: "RUNNING" } }),
    prismaWrite.syncJob.count({ where: { status: "FAILED" } }),
    prismaWrite.syncJob.count({ where: { status: "AUTH_REQUIRED" } }),
    prismaWrite.syncJob.count({ where: { status: "DONE" } }),
  ]);
  return { pending, retry, running, failed, authRequired, done };
}
