import { Router } from "express";
import { fileController } from "../container.js";
import { authenticateJWT } from "../middleware/auth.js";

export const filesRouter = Router();

filesRouter.use(authenticateJWT);
filesRouter.post("/presign", fileController.presign);
filesRouter.post("/confirm", fileController.confirm);
filesRouter.get("/:fileId", fileController.getFile);
