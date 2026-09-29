import express from "express";
import { buildHealth } from "@manage-teams/lib";
import { syncRoutes } from "./modules/sync/sync.routes.js";
import { getGoogleMetrics } from "./modules/sync/metrics.js";

export const serviceName = "google-sync-service";

/** Express app: health + sync/chat/sheets routes. */
export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.get("/health", (_req, res) =>
    res.json({
      ...buildHealth(serviceName),
      google: getGoogleMetrics(),
    }),
  );
  app.use(syncRoutes);
  return app;
}
