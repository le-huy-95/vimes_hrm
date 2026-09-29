import type { Request, RequestHandler } from "express";
import { AppError, verifyAccessToken } from "@manage-teams/lib";

/** Paths under /auth that do not require a Bearer token. */
export const PUBLIC_AUTH_PATHS = new Set([
  "/auth/register",
  "/auth/login",
  "/auth/verify-email",
  "/auth/resend-otp",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/refresh",
  "/auth/google/authorize-url",
  "/auth/google/callback",
  "/auth/google/id-token",
  "/google-chat/webhook",
  "/drive/webhook",
]);

export type AuthedRequest = Request & { userId?: string };

export function createJwtGuard(jwtSecret: string): RequestHandler {
  const key = new TextEncoder().encode(jwtSecret);
  return async (req, _res, next) => {
    try {
      if (req.method === "OPTIONS") {
        next();
        return;
      }
      const path = req.path;
      if (
        path === "/health" ||
        path === "/metrics" ||
        path === "/ai/ping" ||
        PUBLIC_AUTH_PATHS.has(path)
      ) {
        next();
        return;
      }
      const header = req.header("authorization");
      if (!header?.startsWith("Bearer ")) {
        throw new AppError("Chưa xác thực", "UNAUTHORIZED", 401);
      }
      const payload = await verifyAccessToken(header.slice(7), key);
      (req as AuthedRequest).userId = String(payload.sub ?? "");
      next();
    } catch (err) {
      next(err instanceof AppError ? err : new AppError("Chưa xác thực", "UNAUTHORIZED", 401));
    }
  };
}
