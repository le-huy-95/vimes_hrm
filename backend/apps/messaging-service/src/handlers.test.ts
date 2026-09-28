import { describe, expect, it, beforeEach } from "vitest";
import { clearSentEmails, getSentEmails } from "./email.js";
import {
  sendOtpVerifyEmail,
  sendPasswordResetOtpEmail,
  sendOrgInviteEmail,
} from "./handlers.js";
import { SITE_NAME } from "./templates.js";

describe("Vimes email handlers", () => {
  beforeEach(() => clearSentEmails());

  it("sends verify OTP with Vimes branding", async () => {
    await sendOtpVerifyEmail({
      to: "a@example.com",
      userName: "An",
      otpCode: "123456",
      expiryMinutes: 10,
    });
    const mail = getSentEmails()[0]!;
    expect(mail.subject).toBe(`Mã xác minh ${SITE_NAME}`);
    expect(mail.html).toContain("Vimes");
    expect(mail.html).toContain("123456");
    expect(mail.html).not.toContain("tenantName");
  });

  it("sends reset OTP with distinct subject", async () => {
    await sendPasswordResetOtpEmail({
      to: "a@example.com",
      otpCode: "654321",
      expiryMinutes: 10,
    });
    const mail = getSentEmails()[0]!;
    expect(mail.subject).toBe(`Đặt lại mật khẩu ${SITE_NAME}`);
    expect(mail.html).toContain("Đặt lại mật khẩu");
  });

  it("sends org invite with org name", async () => {
    await sendOrgInviteEmail({
      to: "b@example.com",
      orgName: "Acme Org",
      roleLabel: "Thành viên",
      inviterName: "Bình",
      acceptUrl: "https://app.example.com/invites/org?token=abc",
      expiryHours: 72,
    });
    const mail = getSentEmails()[0]!;
    expect(mail.subject).toContain("Acme Org");
    expect(mail.subject).toContain("Vimes");
    expect(mail.html).toContain("Acme Org");
    expect(mail.html).toContain("Chấp nhận lời mời");
  });
});
