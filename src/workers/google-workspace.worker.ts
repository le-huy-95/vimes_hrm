import { Worker } from "bullmq";
import { redis } from "../lib/redis.js";
import { WORKSPACE_SYNC_QUEUE } from "../lib/queue.js";
import type { WorkspaceSyncService } from "../services/workspace-sync.service.js";

export function startWorkspaceSyncWorker(syncService: WorkspaceSyncService) {
  const worker = new Worker(
    WORKSPACE_SYNC_QUEUE,
    async (job) => {
      const { orgId, triggeredByUserId } = job.data as {
        orgId: string;
        triggeredByUserId?: string;
      };
      return syncService.runSync(orgId, triggeredByUserId);
    },
    {
      connection: redis,
      concurrency: 2,
      limiter: { max: 10, duration: 60_000 },
    },
  );
  worker.on("failed", (job, err) => {
    console.error("workspace sync failed", job?.id, err);
  });
  return worker;
}
