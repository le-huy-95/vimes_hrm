import { Router } from "express";
import * as pushController from "./push.controller.js";

/** Route đăng ký device push token (Phase 1.7 stub). */
export const pushRoutes: Router = Router();

pushRoutes.post("/devices/push-token", (req, res) => void pushController.upsertToken(req, res));
pushRoutes.delete("/devices/push-token", (req, res) => void pushController.removeToken(req, res));
pushRoutes.get("/devices/push-token", (req, res) => void pushController.listTokens(req, res));
