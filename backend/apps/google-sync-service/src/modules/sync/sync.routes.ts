import { Router } from "express";
import * as syncController from "./sync.controller.js";
import * as chatEventsController from "../chat/chat-events.controller.js";
import * as bridgeController from "../chat/bridge.controller.js";

export const syncRoutes: Router = Router();

syncRoutes.post("/internal/sync/tasks/push", (req, res) =>
  void syncController.enqueueTask(req, res),
);
syncRoutes.post("/internal/sync/tasks/pull", (req, res) =>
  void syncController.enqueuePullInternal(req, res),
);
syncRoutes.post("/internal/sync/reconcile", (req, res) =>
  void syncController.reconcile(req, res),
);
syncRoutes.post("/sync/tasks/pull", (req, res) =>
  void syncController.enqueuePullUser(req, res),
);
syncRoutes.post("/sync/tasks/full", (req, res) => void syncController.fullSync(req, res));
syncRoutes.get("/sync/status", (req, res) => void syncController.syncStatus(req, res));
syncRoutes.post("/internal/sync/sheets", (req, res) =>
  void syncController.enqueueSheets(req, res),
);
syncRoutes.post("/internal/sync/sheets/ensure", (req, res) =>
  void syncController.ensureSheet(req, res),
);
syncRoutes.get("/sync/sheets/:groupId", (req, res) =>
  void syncController.sheetStatus(req, res),
);
syncRoutes.post("/sync/sheets/:groupId/ensure", (req, res) =>
  void syncController.ensureSheetUser(req, res),
);
syncRoutes.post("/sync/sheets/:groupId/push", (req, res) =>
  void syncController.pushSheetUser(req, res),
);
syncRoutes.post("/sync/sheets/:groupId/pull", (req, res) =>
  void syncController.pullSheetUser(req, res),
);
syncRoutes.post("/internal/sync/drive/watch", (req, res) =>
  void syncController.driveWatch(req, res),
);
syncRoutes.post("/drive/webhook", (req, res) => void syncController.driveWebhook(req, res));
syncRoutes.post("/internal/sync/dlq/replay", (req, res) =>
  void syncController.dlqReplay(req, res),
);
syncRoutes.get("/metrics", (req, res) => void syncController.metrics(req, res));
syncRoutes.post("/internal/sync/ops", (req, res) => void syncController.opsSnapshot(req, res));
syncRoutes.get("/internal/sync/ops", (req, res) => void syncController.opsSnapshot(req, res));

syncRoutes.post("/internal/google-chat/events", (req, res) =>
  void chatEventsController.receiveEvent(req, res),
);
syncRoutes.post("/google-chat/webhook", (req, res) =>
  void chatEventsController.webhook(req, res),
);

syncRoutes.post("/internal/google-chat/ingest", (req, res) =>
  void bridgeController.ingest(req, res),
);
syncRoutes.post("/internal/google-chat/spaces/register", (req, res) =>
  void bridgeController.registerSpace(req, res),
);
syncRoutes.post("/internal/google-chat/egress", (req, res) =>
  void bridgeController.egress(req, res),
);
syncRoutes.post("/internal/google-chat/watch/renew", (req, res) =>
  void bridgeController.renewWatches(req, res),
);
