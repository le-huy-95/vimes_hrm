import { createServer } from "node:http";
import { createLogger } from "@manage-teams/lib";
import { createApp } from "./app.js";
import { setSocketServer } from "./modules/conversation/conversation.controller.js";
import { cleanupOrphanFiles } from "./modules/file/file.service.js";
import { createSocketServer, setupRedisAdapter } from "./realtime/socket.js";

const logger = createLogger("chat-service");
const port = Number(process.env.PORT ?? 3204);
const orphanIntervalMs = Number(process.env.FILE_ORPHAN_CLEANUP_MS ?? 15 * 60 * 1000);

const app = createApp();
const httpServer = createServer(app);
const io = createSocketServer(httpServer);
setSocketServer(io);

function startOrphanCleanup(): () => void {
  const tick = async () => {
    try {
      const n = await cleanupOrphanFiles();
      if (n > 0) logger.info({ n }, "orphan files cleaned");
    } catch (err) {
      logger.warn({ err }, "orphan cleanup failed");
    }
  };
  const timer = setInterval(() => void tick(), orphanIntervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}

async function main() {
  await setupRedisAdapter(io);
  startOrphanCleanup();
  httpServer.listen(port, () => logger.info({ port }, "chat-service listening"));
}

main().catch((err) => {
  logger.error({ err }, "chat-service failed to start");
  process.exit(1);
});
