import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import type { AuthedRequest } from "./auth.js";

/**
 * Phase 11: Idempotency-Key header for mutating routes.
 * Replays stored response for same user+key within table retention.
 */
export function idempotency() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.header("Idempotency-Key");
    if (!key) return next();

    const user = (req as AuthedRequest).user;
    if (!user?.sub) return next();

    const route = `${req.method} ${req.baseUrl}${req.path}`;
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key_userId: { key, userId: user.sub } },
    });
    if (existing) {
      res.status(existing.responseStatus).json(existing.responseBody);
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const status = res.statusCode || 200;
      void prisma.idempotencyKey
        .create({
          data: {
            key,
            userId: user.sub,
            route,
            responseStatus: status,
            responseBody: body as object,
          },
        })
        .catch(() => undefined);
      return originalJson(body);
    }) as typeof res.json;

    next();
  };
}
