import { Router } from "express";
import * as fileController from "./file.controller.js";

/** Route file upload / download (Phase 1.6). */
export const fileRoutes: Router = Router();

fileRoutes.post("/files/init", (req, res) => void fileController.initUpload(req, res));
fileRoutes.post("/files/:id/complete", (req, res) => void fileController.completeUpload(req, res));
fileRoutes.get("/files/:id/download", (req, res) => void fileController.download(req, res));
