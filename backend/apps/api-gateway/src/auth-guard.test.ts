import { describe, expect, it } from "vitest";
import { PUBLIC_AUTH_PATHS } from "./auth-guard.js";

describe("PUBLIC_AUTH_PATHS", () => {
  it("allows register and login without JWT", () => {
    expect(PUBLIC_AUTH_PATHS.has("/auth/register")).toBe(true);
    expect(PUBLIC_AUTH_PATHS.has("/auth/login")).toBe(true);
    expect(PUBLIC_AUTH_PATHS.has("/auth/me")).toBe(false);
  });
});
