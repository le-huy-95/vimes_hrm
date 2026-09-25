/** GitHub webhook routes — raw body preserved by app.ts for signature verify. */
import { Router } from "express";
import { githubWebhookController } from "../container.js";

export const webhooksRouter = Router();

webhooksRouter.post("/github", githubWebhookController.handle);
