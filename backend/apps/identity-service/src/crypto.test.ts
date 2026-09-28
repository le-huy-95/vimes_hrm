import { describe, expect, it } from "vitest";
import { randomOtp, sha256 } from "./crypto.js";
import { getForgotPasswordMessage } from "./otp.js";

describe("crypto/otp helpers", () => {
  it("hashes stably", () => {
    expect(sha256("123456")).toBe(sha256("123456"));
    expect(sha256("123456")).not.toBe(sha256("123457"));
  });

  it("otp is 6 digits", () => {
    expect(randomOtp(6)).toMatch(/^\d{6}$/);
  });

  it("forgot message is generic", () => {
    expect(getForgotPasswordMessage()).toContain("Nếu email tồn tại");
  });
});
