import type { Request, Response } from "express";
import { z } from "zod";
import { BaseController } from "./base.controller.js";
import type { IntegrationService } from "../services/integration.service.js";
import type { AuthedRequest } from "../middleware/auth.js";

const serviceQuerySchema = z.object({
  service: z.enum(["google", "github"]),
});

export class IntegrationController extends BaseController {
  constructor(private readonly integrations: IntegrationService) {
    super();
  }

  readonly get = this.bind(this.handleGet);
  readonly listMembers = this.bind(this.handleListMembers);
  readonly listCommits = this.bind(this.handleListCommits);

  private teamId(req: Request): string {
    return String(req.params.teamId);
  }

  private async handleGet(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const data = await this.integrations.getIntegrations(
      user.orgId,
      this.teamId(req),
    );
    this.ok(res, data);
  }

  private async handleListMembers(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const { service } = serviceQuerySchema.parse(req.query);
    const data = await this.integrations.listMemberIntegrations(
      user.orgId,
      this.teamId(req),
      service,
    );
    this.ok(res, data);
  }

  private async handleListCommits(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const cursor =
      typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const data = await this.integrations.listGithubCommits(
      user.orgId,
      this.teamId(req),
      String(req.params.userId),
      { cursor },
    );
    this.ok(res, data);
  }
}
