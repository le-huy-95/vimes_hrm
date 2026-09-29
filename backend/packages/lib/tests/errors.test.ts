import { describe, expect, it } from "vitest";
import { AppError, isAppError } from "../src/errors.js";

describe("AppError", () => {
  it("exposes code and status", () => {
    const err = new AppError("nope", "FORBIDDEN", 403);
    expect(err.code).toBe("FORBIDDEN");
    expect(err.statusCode).toBe(403);
    expect(isAppError(err)).toBe(true);
  });
});
