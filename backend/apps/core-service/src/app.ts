/**
 * core-service — nghiệp vụ org / group / task (port 3203).
 * Kiểm tra quyền qua modules/access; outbox event khi task đổi.
 */
import express from "express";
import { buildHealth } from "@manage-teams/lib";
import { groupRoutes } from "./modules/group/group.routes.js";
import { orgRoutes } from "./modules/org/org.routes.js";
import { taskRoutes } from "./modules/task/task.routes.js";

export const serviceName = "core-service";

/** Lắp Express: health + org + group + task routes. */
export function createApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.get("/health", (_req, res) => res.json(buildHealth(serviceName)));
  app.use(orgRoutes);
  app.use(groupRoutes);
  app.use(taskRoutes);
  return app;
}
