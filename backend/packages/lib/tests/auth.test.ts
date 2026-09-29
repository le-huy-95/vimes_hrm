import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { getJwtSecret, requireUser, verifyAccessToken } from "../src/auth.js";
import { AppError } from "../src/errors.js";

describe("auth helpers", () => {
  const secret = getJwtSecret("test-secret");

  it("verifies a signed access token", async () => {
    const token = await new SignJWT({ email: "a@b.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setExpirationTime("5m")
      .sign(secret);
    const payload = await verifyAccessToken(token, secret);
    expect(payload.sub).toBe("user-1");
    expect(payload.email).toBe("a@b.com");
  });

  it("requireUser reads Bearer token", async () => {
    const token = await new SignJWT({ email: "A@B.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-2")
      .setExpirationTime("5m")
      .sign(secret);
    const user = await requireUser(
      { header: (name) => (name === "authorization" ? `Bearer ${token}` : undefined) },
      secret,
    );
    expect(user).toEqual({ id: "user-2", email: "a@b.com" });
  });

  it("requireUser rejects missing auth", async () => {
    await expect(
      requireUser({ header: () => undefined }, secret),
    ).rejects.toBeInstanceOf(AppError);
  });
});
