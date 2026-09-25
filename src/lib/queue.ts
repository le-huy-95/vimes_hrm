import { Queue } from "bullmq";
import { redis } from "./redis.js";

export const WORKSPACE_SYNC_QUEUE = "google-workspace-sync";

export function workspaceSyncJobId(orgId: string) {
  return `google-workspace-sync:${orgId}`;
}

const globalForQueue = globalThis as unknown as {
  workspaceSyncQueue?: Queue;
};

function createWorkspaceSyncQueue() {
  return new Queue(WORKSPACE_SYNC_QUEUE, {
    connection: redis,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
}

export const workspaceSyncQueue =
  globalForQueue.workspaceSyncQueue ?? createWorkspaceSyncQueue();

if (process.env.NODE_ENV !== "production") {
  globalForQueue.workspaceSyncQueue = workspaceSyncQueue;
}

export async function closeWorkspaceSyncQueue(): Promise<void> {
  await workspaceSyncQueue.close();
}
