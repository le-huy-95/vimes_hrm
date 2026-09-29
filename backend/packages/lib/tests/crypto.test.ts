import { describe, expect, it } from "vitest";
import { randomToken, sha256 } from "../src/crypto.js";

describe("crypto helpers", () => {
  it("hashes deterministically", () => {
    expect(sha256("abc")).toBe(sha256("abc"));
    expect(sha256("abc")).not.toBe(sha256("abd"));
    expect(sha256("abc")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("generates unique tokens", () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});
