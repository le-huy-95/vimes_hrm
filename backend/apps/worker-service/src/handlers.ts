import { z } from "zod";
import { renderTemplate, SITE_NAME } from "./templates.js";
import { sendEmail, type SentEmail } from "./email.js";

export const OtpEmailSchema = z.object({
  to: z.string().email(),
  userName: z.string().optional(),
  otpCode: z.string().min(4).max(12),
  expiryMinutes: z.number().int().positive(),
  userId: z.string().uuid().optional(),
});

export const OrgInviteEmailSchema = z.object({
  to: z.string().email(),
  orgName: z.string().min(1),
  roleLabel: z.string().min(1),
  inviterName: z.string().min(1),
  acceptUrl: z.string().url(),
  expiryHours: z.number().int().positive(),
  userId: z.string().uuid().optional(),
});

export type OtpEmailInput = z.infer<typeof OtpEmailSchema>;
export type OrgInviteEmailInput = z.infer<typeof OrgInviteEmailSchema>;

export async function sendOtpVerifyEmail(input: OtpEmailInput): Promise<SentEmail> {
  const userName = input.userName || input.to;
  const html = renderTemplate("otp-verify", {
    userName,
    otpCode: input.otpCode,
    expiryMinutes: input.expiryMinutes,
  });
  const text = `Xin chào ${userName}, mã xác minh ${SITE_NAME} của bạn là ${input.otpCode}. Hết hạn sau ${input.expiryMinutes} phút.`;
  return sendEmail({
    to: input.to,
    subject: `Mã xác minh ${SITE_NAME}`,
    text,
    html,
  });
}

export async function sendPasswordResetOtpEmail(input: OtpEmailInput): Promise<SentEmail> {
  const userName = input.userName || input.to;
  const html = renderTemplate("otp-reset", {
    userName,
    otpCode: input.otpCode,
    expiryMinutes: input.expiryMinutes,
  });
  const text = `Xin chào ${userName}, mã đặt lại mật khẩu ${SITE_NAME}: ${input.otpCode}. Hết hạn sau ${input.expiryMinutes} phút.`;
  return sendEmail({
    to: input.to,
    subject: `Đặt lại mật khẩu ${SITE_NAME}`,
    text,
    html,
  });
}

export async function sendOrgInviteEmail(input: OrgInviteEmailInput): Promise<SentEmail> {
  const html = renderTemplate("org-invite", {
    orgName: input.orgName,
    roleLabel: input.roleLabel,
    inviterName: input.inviterName,
    acceptUrl: input.acceptUrl,
    expiryHours: input.expiryHours,
  });
  const text = `${input.inviterName} mời bạn vào tổ chức ${input.orgName} trên ${SITE_NAME} (${input.roleLabel}). Mở: ${input.acceptUrl}`;
  return sendEmail({
    to: input.to,
    subject: `Lời mời vào tổ chức ${input.orgName} trên ${SITE_NAME}`,
    text,
    html,
  });
}
