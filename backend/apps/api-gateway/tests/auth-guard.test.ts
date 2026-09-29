import { describe, expect, it } from "vitest";
import { PUBLIC_AUTH_PATHS } from "../src/middlewares/auth-guard.js";

describe("PUBLIC_AUTH_PATHS", () => {
  it("allows register and login without JWT", () => {
    expect(PUBLIC_AUTH_PATHS.has("/auth/register")).toBe(true);
    expect(PUBLIC_AUTH_PATHS.has("/auth/login")).toBe(true);
    expect(PUBLIC_AUTH_PATHS.has("/auth/refresh")).toBe(true);
    expect(PUBLIC_AUTH_PATHS.has("/auth/google/authorize-url")).toBe(true);
    expect(PUBLIC_AUTH_PATHS.has("/auth/google/callback")).toBe(true);
    expect(PUBLIC_AUTH_PATHS.has("/auth/google/id-token")).toBe(true);
    expect(PUBLIC_AUTH_PATHS.has("/auth/google/link")).toBe(false);
    expect(PUBLIC_AUTH_PATHS.has("/auth/google/link-id-token")).toBe(false);
    expect(PUBLIC_AUTH_PATHS.has("/auth/google/accounts/x/primary")).toBe(false);
    expect(PUBLIC_AUTH_PATHS.has("/auth/me")).toBe(false);
  });
});
