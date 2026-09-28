import { describe, expect, it } from "vitest";
import { CORRELATION_HEADER, correlationIdMiddleware } from "./correlation.js";

describe("correlationIdMiddleware", () => {
  it("generates id when missing", () => {
    const mw = correlationIdMiddleware();
    const req = { header: () => undefined, headers: {} as Record<string, string> };
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
    };
    let nextCalled = false;
    mw(req as never, res as never, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(req.headers[CORRELATION_HEADER]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(headers[CORRELATION_HEADER]).toBe(req.headers[CORRELATION_HEADER]);
  });

  it("keeps incoming correlation id", () => {
    const mw = correlationIdMiddleware();
    const req = {
      header: (name: string) => (name === CORRELATION_HEADER ? "abc-123" : undefined),
      headers: {} as Record<string, string>,
    };
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
    };
    mw(req as never, res as never, () => undefined);
    expect(req.headers[CORRELATION_HEADER]).toBe("abc-123");
    expect(headers[CORRELATION_HEADER]).toBe("abc-123");
  });
});
