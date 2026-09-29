import type { RequestHandler, Response } from "express";
import { isAppError } from "./errors.js";
import type { Logger } from "./logger.js";

type ErrorBody = { error: string; message?: string; details?: unknown };

function isZodLike(err: unknown): err is { issues: unknown } {
  return Boolean(err && typeof err === "object" && "issues" in err);
}

/**
 * Chuẩn hóa lỗi HTTP: AppError → status+code; Zod → 400; còn lại → 500.
 */
export function sendError(
  res: Response,
  err: unknown,
  logger?: Pick<Logger, "error">,
): void {
  if (isAppError(err)) {
    const body: ErrorBody = { error: err.code, message: err.message };
    if (err.details !== undefined) body.details = err.details;
    res.status(err.statusCode).json(body);
    return;
  }
  if (isZodLike(err)) {
    res.status(400).json({ error: "VALIDATION", details: err });
    return;
  }
  logger?.error({ err }, "request failed");
  res.status(500).json({ error: "INTERNAL" });
}

/** Bọc handler async Express — rejection được chuyển sang `next(err)`. */
export function asyncHandler(
  fn: (
    req: Parameters<RequestHandler>[0],
    res: Response,
    next: Parameters<RequestHandler>[2],
  ) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}
