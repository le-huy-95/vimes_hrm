import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/errors.js";
import { sendError } from "../src/http.js";

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe("sendError", () => {
  it("maps AppError", () => {
    const res = mockRes();
    sendError(res as never, new AppError("nope", "FORBIDDEN", 403));
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "FORBIDDEN", message: "nope" });
  });

  it("maps zod-like validation", () => {
    const res = mockRes();
    sendError(res as never, { issues: [{ path: ["email"] }] });
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe("VALIDATION");
  });

  it("falls back to 500 and logs", () => {
    const res = mockRes();
    const logger = { error: vi.fn() };
    sendError(res as never, new Error("boom"), logger);
    expect(res.statusCode).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });
});
