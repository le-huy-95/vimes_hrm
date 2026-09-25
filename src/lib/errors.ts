export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function assertFound<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new AppError(404, message);
  return value;
}
