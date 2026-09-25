/**
 * GithubWebhookController — HTTP layer for GitHub webhook deliveries.
 * Verifies HMAC signature against the raw request body.
 */
import type { Request, Response } from "express";
import { BaseController } from "./base.controller.js";
import type { GithubWebhookService } from "../services/github-webhook.service.js";

type RawBodyRequest = Request & { rawBody?: Buffer };

export class GithubWebhookController extends BaseController {
  constructor(private readonly webhooks: GithubWebhookService) {
    super();
  }

  readonly handle = this.bind(this.handleDelivery);

  private async handleDelivery(req: Request, res: Response) {
    const rawBody =
      (req as RawBodyRequest).rawBody ??
      (Buffer.isBuffer(req.body) ? req.body : undefined);
    if (!rawBody) {
      res.status(400).json({ error: "Missing raw body" });
      return;
    }
    const result = await this.webhooks.accept({
      rawBody,
      signature:
        (req.headers["x-hub-signature-256"] as string | undefined) ??
        undefined,
      deliveryId: req.headers["x-github-delivery"] as string | undefined,
      event: req.headers["x-github-event"] as string | undefined,
    });
    if ("duplicate" in result) {
      res.status(200).json({ duplicate: true });
      return;
    }
    res.status(202).json({ accepted: true });
  }
}
