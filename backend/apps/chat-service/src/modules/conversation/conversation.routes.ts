import { Router } from "express";
import * as conversationController from "./conversation.controller.js";
import * as reactionController from "./reaction.controller.js";
import * as fileController from "../file/file.controller.js";
import { chatReactionRateLimit } from "../../middlewares/rate-limit.js";

/** Route conversation (public + internal). */
export const conversationRoutes: Router = Router();

conversationRoutes.post("/internal/conversations/ensure-group", (req, res) =>
  void conversationController.ensureGroup(req, res),
);
conversationRoutes.post("/internal/conversations/ensure-task", (req, res) =>
  void conversationController.ensureTask(req, res),
);
conversationRoutes.post("/internal/conversations/remove-member", (req, res) =>
  void conversationController.removeMember(req, res),
);
conversationRoutes.post("/internal/conversations/ingest-external", (req, res) =>
  void conversationController.ingestExternal(req, res),
);
conversationRoutes.get("/conversations", (req, res) =>
  void conversationController.listConversations(req, res),
);
conversationRoutes.post("/conversations/ensure-group", (req, res) =>
  void conversationController.ensureGroupPublic(req, res),
);
conversationRoutes.post("/conversations/ensure-dm", (req, res) =>
  void conversationController.ensureDmPublic(req, res),
);
conversationRoutes.get("/conversations/:id/messages", (req, res) =>
  void conversationController.listMessages(req, res),
);
conversationRoutes.post("/conversations/:id/messages", (req, res) =>
  void conversationController.postMessage(req, res),
);
conversationRoutes.post("/conversations/:id/read", (req, res) =>
  void conversationController.markRead(req, res),
);
conversationRoutes.patch("/conversations/:id/messages/:messageId", (req, res) =>
  void conversationController.editMessage(req, res),
);
conversationRoutes.delete("/conversations/:id/messages/:messageId", (req, res) =>
  void conversationController.deleteMessage(req, res),
);
conversationRoutes.get("/conversations/:id/files", (req, res) =>
  void fileController.listFiles(req, res),
);
conversationRoutes.post(
  "/conversations/:id/messages/:messageId/reactions",
  chatReactionRateLimit(),
  (req, res) => void reactionController.toggleReaction(req, res),
);
conversationRoutes.get("/conversations/:id/messages/:messageId/reactions", (req, res) =>
  void reactionController.listReactions(req, res),
);
conversationRoutes.get("/conversations/:id/search", (req, res) =>
  void reactionController.search(req, res),
);
