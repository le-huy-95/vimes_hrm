import { AppError } from "@manage-teams/lib";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function formatTaskDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

/** undefined = omit; null = clear; Date = set */
export function parseTaskDateOrThrow(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!DATE_RE.test(value)) {
    throw new AppError("Ngày không hợp lệ", "INVALID_DATE", 400);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

export function assertStartNotAfterDue(
  start: Date | null | undefined,
  due: Date | null | undefined,
): void {
  if (!start || !due) return;
  if (start.getTime() > due.getTime()) {
    throw new AppError(
      "Ngày bắt đầu không được sau hạn chót",
      "START_AFTER_DUE",
      400,
    );
  }
}
