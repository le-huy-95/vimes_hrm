import { describe, expect, it } from "vitest";
import { buildGoogleAuthorizeUrl, accountTypeFromClaims } from "../src/infra/google-oauth.js";
import { encryptSecret, decryptSecret } from "../src/infra/secret-box.js";

describe("google-oauth helpers", () => {
  it("builds authorize URL with PKCE params and Tasks scope", () => {
    process.env.GOOGLE_CLIENT_ID = "client-123.apps.googleusercontent.com";
    const url = buildGoogleAuthorizeUrl({
      redirectUri: "http://localhost:3000/auth/google/callback",
      state: "state-1",
      codeChallenge: "challenge-abc",
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("code_challenge")).toBe("challenge-abc");
    expect(parsed.searchParams.get("client_id")).toBe("client-123.apps.googleusercontent.com");
    expect(parsed.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/tasks");
    expect(parsed.searchParams.get("access_type")).toBe("offline");
  });

  it("detects workspace vs personal", () => {
    expect(accountTypeFromClaims({ sub: "1", email: "a@x.com", email_verified: true, hd: "x.com" })).toBe(
      "workspace",
    );
    expect(accountTypeFromClaims({ sub: "1", email: "a@gmail.com", email_verified: true })).toBe(
      "personal",
    );
  });

  it("encrypts refresh tokens round-trip", () => {
    const enc = encryptSecret("refresh-token-value");
    expect(enc).not.toContain("refresh-token-value");
    expect(decryptSecret(enc)).toBe("refresh-token-value");
  });
});
