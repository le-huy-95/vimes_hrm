/**
 * Lỗi nghiệp vụ có mã và HTTP status — dùng thống nhất giữa các service.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode = 500,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Kiểm tra một giá trị có phải `AppError` hay không. */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
