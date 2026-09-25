import { Queue } from "bullmq";
import { redis } from "./redis.js";

export const WORKSPACE_SYNC_QUEUE = "google-workspace-sync";
export const GITHUB_WEBHOOK_QUEUE = "github-webhook";
export const GITHUB_SYNC_REPOS_QUEUE = "github-sync-repos";
export const FILE_THUMBNAIL_QUEUE = "file-thumbnail";

export function workspaceSyncJobId(orgId: string) {
  return `google-workspace-sync:${orgId}`;
}

export function githubSyncReposJobId(installationId: string) {
  return `github-sync-repos:${installationId}`;
}

const globalForQueue = globalThis as unknown as {
  workspaceSyncQueue?: Queue;
  githubWebhookQueue?: Queue;
  githubSyncReposQueue?: Queue;
  fileThumbnailQueue?: Queue;
};

function createQueue(name: string) {
  return new Queue(name, {
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
  globalForQueue.workspaceSyncQueue ?? createQueue(WORKSPACE_SYNC_QUEUE);

export const githubWebhookQueue =
  globalForQueue.githubWebhookQueue ?? createQueue(GITHUB_WEBHOOK_QUEUE);

export const githubSyncReposQueue =
  globalForQueue.githubSyncReposQueue ?? createQueue(GITHUB_SYNC_REPOS_QUEUE);

export const fileThumbnailQueue =
  globalForQueue.fileThumbnailQueue ?? createQueue(FILE_THUMBNAIL_QUEUE);

if (process.env.NODE_ENV !== "production") {
  globalForQueue.workspaceSyncQueue = workspaceSyncQueue;
  globalForQueue.githubWebhookQueue = githubWebhookQueue;
  globalForQueue.githubSyncReposQueue = githubSyncReposQueue;
  globalForQueue.fileThumbnailQueue = fileThumbnailQueue;
}

export async function closeWorkspaceSyncQueue(): Promise<void> {
  await workspaceSyncQueue.close();
}

export async function closeGithubQueues(): Promise<void> {
  await githubWebhookQueue.close();
  await githubSyncReposQueue.close();
}

export async function closeFileQueues(): Promise<void> {
  await fileThumbnailQueue.close();
}
