/**
 * Error middleware Express (4 tham số).
 * AppError → status tương ứng; ZodError → 400; còn lại → 500.
 */
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: err.issues,
    });
  }
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}
