import { Router } from "express";
import * as aiController from "./ai.controller.js";
import { aiChatRateLimit } from "./rate-limit.js";

/** Route AI Phase 6a/6c/6d/6e. */
export const aiRoutes: Router = Router();

aiRoutes.post("/ai/ping", (req, res) => void aiController.ping(req, res));
aiRoutes.post("/ai/chat", aiChatRateLimit(), (req, res) => void aiController.chat(req, res));
aiRoutes.post("/ai/chat/stream", aiChatRateLimit(), (req, res) => void aiController.chatStream(req, res));
aiRoutes.get("/ai/admin/ops", (req, res) => void aiController.adminOps(req, res));
aiRoutes.post("/internal/ai/index-message", (req, res) => void aiController.indexMessage(req, res));
aiRoutes.post("/internal/ai/bot-ask", (req, res) => void aiController.botAsk(req, res));
