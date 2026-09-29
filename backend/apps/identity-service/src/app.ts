/**
 * identity-service — xác thực & tài khoản (port 3202).
 * login.* = đăng nhập; auth.* = đăng ký / OTP / reset / me / link Google.
 */
import express from "express";
import { buildHealth } from "@manage-teams/lib";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { loginRoutes } from "./modules/login/login.routes.js";

export const serviceName = "identity-service";

/** Lắp Express: health + login routes + auth lifecycle routes. */
export function createApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.get("/health", (_req, res) => res.json(buildHealth(serviceName)));
  app.use(loginRoutes);
  app.use(authRoutes);
  return app;
}
