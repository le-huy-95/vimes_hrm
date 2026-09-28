/**
 * AI SERVICE — Phase 6a deepen (:3205)
 * Orchestrator đọc-only + link resolver; Mock / Anthropic / OpenAI (Codex-compatible).
 */
import express from "express";
import { buildHealth } from "@manage-teams/lib";
import { aiRoutes } from "./modules/ai/ai.routes.js";

export const serviceName = "ai-service";

export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (_req, res) => res.json(buildHealth(serviceName)));
  app.use(aiRoutes);
  return app;
}
