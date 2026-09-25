import { Worker } from "bullmq";
import { redis } from "../lib/redis.js";
import { GITHUB_SYNC_REPOS_QUEUE, GITHUB_WEBHOOK_QUEUE } from "../lib/queue.js";
import type { GithubSyncService } from "../services/github-sync.service.js";
import type { GithubWebhookService } from "../services/github-webhook.service.js";

export function startGithubWorkers(
  webhookService: GithubWebhookService,
  syncService: GithubSyncService,
) {
  const webhookWorker = new Worker(
    GITHUB_WEBHOOK_QUEUE,
    async (job) => webhookService.processJob(job.data),
    { connection: redis },
  );
  webhookWorker.on("failed", (job, err) => {
    console.error("github webhook failed", job?.id, err);
  });

  const syncWorker = new Worker(
    GITHUB_SYNC_REPOS_QUEUE,
    async (job) => {
      const { installationId, teamId } = job.data as {
        installationId: string;
        teamId?: string;
      };
      return syncService.runSync(installationId, teamId);
    },
    { connection: redis },
  );
  syncWorker.on("failed", (job, err) => {
    console.error("github sync failed", job?.id, err);
  });

  return {
    async close() {
      await webhookWorker.close();
      await syncWorker.close();
    },
  };
}
