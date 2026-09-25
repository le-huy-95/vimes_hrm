import { Worker } from "bullmq";
import { redis } from "../lib/redis.js";
import type { GchatService } from "../services/gchat.service.js";

export const GCHAT_HEALTH_QUEUE = "gchat-health";

export function startGchatHealthWorker(gchat: GchatService) {
  const worker = new Worker(
    GCHAT_HEALTH_QUEUE,
    async (job) => {
      if (job.name === "renew") return gchat.renewSubscriptions();
      if (job.name === "stale-check") return gchat.checkStaleSubscriptions();
      if (job.name === "backup-poll") {
        // Phase 10: spaces.messages.list backup — stub logs for now
        console.log("[gchat] backup poll stub");
        return { polled: 0 };
      }
      return { skipped: true };
    },
    { connection: redis, concurrency: 1 },
  );
  worker.on("failed", (job, err) => {
    console.error("gchat health job failed", job?.id, err);
  });
  return worker;
}
