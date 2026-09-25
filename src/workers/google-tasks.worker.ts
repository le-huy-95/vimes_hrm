import { Worker } from "bullmq";
import { redis } from "../lib/redis.js";
import { GOOGLE_TASKS_SYNC_QUEUE } from "../lib/queue.js";
import type { GoogleTasksService } from "../services/google-tasks.service.js";

export function startGoogleTasksSyncWorker(service: GoogleTasksService) {
  const worker = new Worker(
    GOOGLE_TASKS_SYNC_QUEUE,
    async (job) => {
      const { teamId, orgId, actorUserId } = job.data as {
        teamId: string;
        orgId: string;
        actorUserId?: string;
      };
      return service.runSync(teamId, orgId, actorUserId);
    },
    {
      connection: redis,
      concurrency: 2,
      limiter: { max: 10, duration: 60_000 },
    },
  );
  worker.on("failed", (job, err) => {
    console.error("google tasks sync failed", job?.id, err);
  });
  return worker;
}
