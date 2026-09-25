import type { Request, Response } from "express";
import { BaseController } from "./base.controller.js";
import type { DashboardService } from "../services/dashboard.service.js";
import type { AuthedRequest } from "../middleware/auth.js";

export class DashboardController extends BaseController {
  constructor(private readonly dashboard: DashboardService) {
    super();
  }

  readonly get = this.bind(this.handleGet);

  private async handleGet(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const refresh =
      req.query.refresh === "1" || req.query.refresh === "true";
    const data = await this.dashboard.getDashboard(
      String(req.params.teamId),
      user.orgId,
      { refresh },
    );
    this.ok(res, data);
  }
}
