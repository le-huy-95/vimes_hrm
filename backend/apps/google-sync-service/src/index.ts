/**
 * GOOGLE-SYNC SERVICE — Tasks/Sheets/Chat bridge stubs (:3207)
 */
import { createLogger } from "@manage-teams/lib";
import { createApp } from "./app.js";
import { renewExpiringWatches } from "./modules/chat/bridge.service.js";
import { startSyncWorker } from "./modules/sync/sync.worker.js";

const logger = createLogger("google-sync-service");
const port = Number(process.env.PORT ?? 3207);
const watchIntervalMs = Number(process.env.CHAT_WATCH_RENEW_MS ?? 10 * 60_000);

const app = createApp();
const server = app.listen(port, () => {
  logger.info({ port }, "google-sync-service listening");
});

const stopWorker = startSyncWorker();
// Background Google Tasks poller tắt — chỉ sync khi user bấm Pull/Full trên tab Sync
// hoặc khi login/push enqueue job.

const watchTimer = setInterval(() => {
  void renewExpiringWatches().catch((err) => logger.warn({ err }, "watch renew failed"));
}, watchIntervalMs);
watchTimer.unref();

process.on("SIGTERM", () => {
  stopWorker();
  clearInterval(watchTimer);
  server.close();
});
