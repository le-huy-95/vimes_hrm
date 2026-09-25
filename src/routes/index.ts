/**
 * Đăng ký prefix API cho từng module.
 * Router chỉ map URL — không chứa business logic.
 */
import type { Express } from "express";
import { authRouter } from "./auth.routes.js";
import { orgsRouter } from "./orgs.routes.js";
import { teamsRouter } from "./teams.routes.js";

export function registerRoutes(app: Express) {
  app.use("/auth", authRouter);
  app.use("/orgs", orgsRouter);
  app.use("/teams", teamsRouter);
}
