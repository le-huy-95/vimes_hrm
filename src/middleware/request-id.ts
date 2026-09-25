import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = req.header("X-Request-Id") || randomUUID();
  res.setHeader("X-Request-Id", id);
  (req as Request & { requestId?: string }).requestId = id;
  next();
}
