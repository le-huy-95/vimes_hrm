import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  verifyGithubWebhookSignature,
} from "./github-webhook-verify.js";

const secret = "test-webhook-secret";
const body = Buffer.from('{"zen":"design for failure"}', "utf8");

function sign(raw: Buffer, sec: string) {
  return (
    "sha256=" + createHmac("sha256", sec).update(raw).digest("hex")
  );
}

describe("verifyGithubWebhookSignature", () => {
  it("accepts valid signature", () => {
    expect(
      verifyGithubWebhookSignature(body, sign(body, secret), secret),
    ).toBe(true);
  });

  it("rejects invalid signature", () => {
    expect(
      verifyGithubWebhookSignature(body, "sha256=deadbeef", secret),
    ).toBe(false);
  });

  it("rejects missing header", () => {
    expect(verifyGithubWebhookSignature(body, undefined, secret)).toBe(false);
  });

  it("rejects wrong secret", () => {
    expect(
      verifyGithubWebhookSignature(body, sign(body, "other"), secret),
    ).toBe(false);
  });
});
