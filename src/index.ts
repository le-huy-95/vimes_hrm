/**
 * Điểm vào ứng dụng API.
 * Tạo Express app rồi lắng nghe cổng từ biến môi trường,
 * đồng thời khởi động BullMQ worker cho Google Workspace sync.
 */
import { createApp } from "./app.js";
import { env } from "./lib/env.js";
import { container } from "./container.js";
import { startWorkspaceSyncWorker } from "./workers/google-workspace.worker.js";
import { startGithubWorkers } from "./workers/github.worker.js";
import { startThumbnailWorker } from "./workers/thumbnail.worker.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});

const worker = startWorkspaceSyncWorker(container.services.workspaceSync);
const githubWorkers = startGithubWorkers(
  container.services.githubWebhook,
  container.services.githubSync,
);
const thumbnailWorker = startThumbnailWorker(container.repositories.file);

async function shutdown(signal: string) {
  console.log(`received ${signal}, shutting down…`);
  await githubWorkers.close();
  await thumbnailWorker.close();
  await worker.close();
  server.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));