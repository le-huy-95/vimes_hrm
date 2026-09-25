import { describe, expect, it, beforeAll } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL ??=
    "postgresql://manage:manage@localhost:5433/manage_teams?schema=public";
  process.env.JWT_ACCESS_SECRET ??= "test-access-secret-min-32-chars!!!!";
  process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-min-32-chars!!!";
  process.env.TOKEN_ENCRYPTION_KEY ??=
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

describe("Phase 12 smoke", () => {
  it("GET /health returns ok and X-Request-Id", async () => {
    const { createApp } = await import("./app.js");
    const { default: request } = await import("supertest");
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("POST /auth/register rejects invalid body", async () => {
    const { createApp } = await import("./app.js");
    const { default: request } = await import("supertest");
    const app = createApp();
    const res = await request(app).post("/auth/register").send({});
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
