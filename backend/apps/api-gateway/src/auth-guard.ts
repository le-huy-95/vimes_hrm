import type { Request, RequestHandler } from "express";
import { jwtVerify } from "jose";
import { AppError } from "@manage-teams/common";

const encoder = new TextEncoder();

/** Paths under /auth that do not require a Bearer token. */
export const PUBLIC_AUTH_PATHS = new Set([
  "/auth/register",
  "/auth/login",
  "/auth/verify-email",
  "/auth/resend-otp",
  "/auth/forgot-password",
  "/auth/reset-password",
]);

export type AuthedRequest = Request & { userId?: string };

export function createJwtGuard(jwtSecret: string): RequestHandler {
  const key = encoder.encode(jwtSecret);
  return async (req, _res, next) => {
    try {
      if (req.method === "OPTIONS") {
        next();
        return;
      }
      const path = req.path;
      if (path === "/health" || PUBLIC_AUTH_PATHS.has(path)) {
        next();
        return;
      }
      const header = req.header("authorization");
      if (!header?.startsWith("Bearer ")) {
        throw new AppError("Unauthorized", "UNAUTHORIZED", 401);
      }
      const { payload } = await jwtVerify(header.slice(7), key);
      (req as AuthedRequest).userId = String(payload.sub ?? "");
      next();
    } catch (err) {
      next(err instanceof AppError ? err : new AppError("Unauthorized", "UNAUTHORIZED", 401));
    }
  };
}
