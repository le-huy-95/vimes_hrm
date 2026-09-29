/**
 * CHAT SERVICE — hội thoại & realtime (:3204)
 * REST conversations/files; Socket.IO gắn ở index.ts.
 */
import express from "express";
import { buildHealth } from "@manage-teams/lib";
import { conversationRoutes } from "./modules/conversation/conversation.routes.js";
import { fileRoutes } from "./modules/file/file.routes.js";
import { pushRoutes } from "./modules/push/push.routes.js";

export const serviceName = "chat-service";

/** Tạo Express app chat (REST); Socket gắn ở index.ts. */
export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.get("/health", (_req, res) => res.json(buildHealth(serviceName)));
  app.use(fileRoutes);
  app.use(pushRoutes);
  app.use(conversationRoutes);
  return app;
}
