/**
 * Middleware xác thực JWT.
 * Đọc header Authorization: Bearer <token>, gắn payload vào req.user.
 */
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors.js";
import { verifyAccessToken, type AccessPayload } from "../lib/tokens.js";

/** Request đã qua authenticateJWT — chắc chắn có user */
export type AuthedRequest = Request & { user: AccessPayload };

export function authenticateJWT(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new AppError(401, "Missing bearer token");
    }
    const token = header.slice(7);
    (req as AuthedRequest).user = verifyAccessToken(token);
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError(401, "Invalid or expired token"));
  }
}
