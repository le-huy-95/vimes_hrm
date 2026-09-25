import { Queue } from "bullmq";
import { env } from "./env.js";

export const WORKSPACE_SYNC_QUEUE = "google-workspace-sync";

export function workspaceSyncJobId(orgId: string) {
  return `google-workspace-sync:${orgId}`;
}

export const workspaceSyncQueue = new Queue(WORKSPACE_SYNC_QUEUE, {
  connection: { url: env.REDIS_URL },
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});
