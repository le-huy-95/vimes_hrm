import { describe, expect, it, beforeEach } from "vitest";
import { clearSentEmails, getSentEmails, sendEmail } from "../src/email.js";

describe("sendEmail stub", () => {
  beforeEach(() => clearSentEmails());

  it("records email without SMTP", async () => {
    await sendEmail({ to: "a@example.com", subject: "OTP", text: "123456" });
    expect(getSentEmails()).toHaveLength(1);
    expect(getSentEmails()[0]?.to).toBe("a@example.com");
  });
});
