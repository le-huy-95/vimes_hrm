/**
 * Điểm vào ứng dụng API.
 * Tạo Express app rồi lắng nghe cổng từ biến môi trường,
 * đồng thời khởi động BullMQ workers, Socket.IO, và GChat Pub/Sub.
 */
import { createApp } from "./app.js";
import { env } from "./lib/env.js";
import { container } from "./container.js";
import { createChatSocket } from "./lib/socket.js";
import { startWorkspaceSyncWorker } from "./workers/google-workspace.worker.js";
import { startGithubWorkers } from "./workers/github.worker.js";
import { startThumbnailWorker } from "./workers/thumbnail.worker.js";
import { startGchatPubSubWorker } from "./workers/gchat-pubsub.worker.js";
import { startGchatHealthWorker } from "./workers/gchat-health.worker.js";
import { startGoogleTasksSyncWorker } from "./workers/google-tasks.worker.js";
import { Queue } from "bullmq";
import { redis } from "./lib/redis.js";
import { GCHAT_HEALTH_QUEUE } from "./workers/gchat-health.worker.js";
import { gchatEnabled } from "./lib/env.js";
import { closeGoogleTasksQueue } from "./lib/queue.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});

void createChatSocket(server, container.services.chat).catch((err) => {
  console.error("Socket.IO failed to start", err);
});

const worker = startWorkspaceSyncWorker(container.services.workspaceSync);
const githubWorkers = startGithubWorkers(
  container.services.githubWebhook,
  container.services.githubSync,
);
const thumbnailWorker = startThumbnailWorker(container.repositories.file);
const gchatPubSub = startGchatPubSubWorker(container.services.gchat);
const gchatHealthWorker = startGchatHealthWorker(container.services.gchat);
const googleTasksWorker = startGoogleTasksSyncWorker(
  container.services.googleTasks,
);

const gchatHealthQueue = new Queue(GCHAT_HEALTH_QUEUE, { connection: redis });
if (gchatEnabled) {
  // BullMQ Job Scheduler API (v5+)
  const q = gchatHealthQueue as Queue & {
    upsertJobScheduler?: (
      id: string,
      opts: { pattern: string },
      job: { name: string; data: object },
    ) => Promise<unknown>;
  };
  if (typeof q.upsertJobScheduler === "function") {
    void q.upsertJobScheduler(
      "gchat-renew",
      { pattern: env.GCHAT_RENEW_CRON },
      { name: "renew", data: {} },
    );
    void q.upsertJobScheduler(
      "gchat-stale",
      { pattern: "0 * * * *" },
      { name: "stale-check", data: {} },
    );
    void q.upsertJobScheduler(
      "gchat-backup",
      { pattern: env.GCHAT_BACKUP_CRON },
      { name: "backup-poll", data: {} },
    );
  } else {
    console.warn("[gchat] Job scheduler API unavailable; skip repeatable health jobs");
  }
}

async function shutdown(signal: string) {
  console.log(`received ${signal}, shutting down…`);
  await gchatPubSub.close();
  await gchatHealthWorker.close();
  await gchatHealthQueue.close();
  await githubWorkers.close();
  await thumbnailWorker.close();
  await googleTasksWorker.close();
  await closeGoogleTasksQueue();
  await worker.close();
  server.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
