import { describe, expect, it } from "vitest";
import {
  assertStartNotAfterDue,
  formatTaskDate,
  parseTaskDateOrThrow,
} from "../src/modules/task/task-dates.js";
import { AppError } from "@manage-teams/lib";

describe("parseTaskDateOrThrow", () => {
  it("returns undefined for undefined", () => {
    expect(parseTaskDateOrThrow(undefined)).toBeUndefined();
  });
  it("returns null for null", () => {
    expect(parseTaskDateOrThrow(null)).toBeNull();
  });
  it("parses YYYY-MM-DD as UTC midnight Date", () => {
    const d = parseTaskDateOrThrow("2026-09-30");
    expect(d?.toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });
  it("rejects bad format", () => {
    expect(() => parseTaskDateOrThrow("30/09/2026")).toThrow(AppError);
  });
});

describe("assertStartNotAfterDue", () => {
  it("allows null sides", () => {
    expect(() => assertStartNotAfterDue(null, null)).not.toThrow();
    expect(() => assertStartNotAfterDue(new Date("2026-09-30T00:00:00.000Z"), null)).not.toThrow();
  });
  it("allows start == due", () => {
    const d = new Date("2026-09-30T00:00:00.000Z");
    expect(() => assertStartNotAfterDue(d, d)).not.toThrow();
  });
  it("rejects start after due with START_AFTER_DUE", () => {
    try {
      assertStartNotAfterDue(
        new Date("2026-10-02T00:00:00.000Z"),
        new Date("2026-10-01T00:00:00.000Z"),
      );
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("START_AFTER_DUE");
    }
  });
});

describe("formatTaskDate", () => {
  it("formats Date to YYYY-MM-DD", () => {
    expect(formatTaskDate(new Date("2026-09-30T00:00:00.000Z"))).toBe("2026-09-30");
  });
  it("returns null for null/undefined", () => {
    expect(formatTaskDate(null)).toBeNull();
    expect(formatTaskDate(undefined)).toBeNull();
  });
});
