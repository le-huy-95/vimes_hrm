/**
 * Bọc handler async của Express.
 *
 * Express không bắt Promise reject tự động — nếu thiếu wrapper này,
 * lỗi trong `async (req,res) => {}` có thể làm process treo / không trả response.
 * `.catch(next)` chuyển lỗi sang errorHandler middleware.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
