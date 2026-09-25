import type { NextFunction, Request, RequestHandler, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";

type BoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => unknown | Promise<unknown>;

/**
 * Lớp cha cho mọi Controller.
 *
 * - ok / created / noContent: trả JSON với status chuẩn (DRY)
 * - bind(): gắn `this` + bọc asyncHandler để lỗi Promise không làm crash server
 */
export abstract class BaseController {
  /** 200 OK + JSON body */
  protected ok(res: Response, data: unknown): void {
    res.json(data);
  }

  /** 201 Created + JSON body (sau khi tạo resource) */
  protected created(res: Response, data: unknown): void {
    res.status(201).json(data);
  }

  /** 204 No Content (xóa / logout thành công) */
  protected noContent(res: Response): void {
    res.status(204).send();
  }

  /**
   * Đăng ký method instance làm Express handler.
   * Bắt buộc bind vì Express gọi handler như function rời → mất `this`.
   */
  protected bind(method: BoundHandler): RequestHandler {
    return asyncHandler(
      method.bind(this) as (
        req: Request,
        res: Response,
        next: NextFunction,
      ) => Promise<unknown>,
    );
  }
}
