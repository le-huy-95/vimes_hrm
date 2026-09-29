import { z } from "zod";

export const SendEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  text: z.string().min(1),
  html: z.string().optional(),
});

export type SendEmailInput = z.infer<typeof SendEmailSchema>;

export type SentEmail = SendEmailInput & { id: string; sentAt: string };

const sent: SentEmail[] = [];

export function getSentEmails(): SentEmail[] {
  return [...sent];
}

export function clearSentEmails(): void {
  sent.length = 0;
}

function resolveFromAddress(): string {
  if (process.env.SMTP_FROM?.trim()) return process.env.SMTP_FROM.trim();
  const name = process.env.DEFAULT_FROM_NAME?.trim() || "Vimes";
  const address = process.env.DEFAULT_FROM_ADDRESS?.trim();
  if (address) return `${name} <${address}>`;
  return "noreply@manage-teams.local";
}

export async function sendEmail(input: SendEmailInput): Promise<SentEmail> {
  const record: SentEmail = {
    ...input,
    id: crypto.randomUUID(),
    sentAt: new Date().toISOString(),
  };
  sent.push(record);

  const host = process.env.SMTP_HOST;
  if (host) {
    const nodemailer = await import("nodemailer");
    // Gmail App Password thường có khoảng trắng khi copy — strip trước khi auth.
    const pass = process.env.SMTP_PASS?.replace(/\s/g, "") ?? "";
    const user = process.env.SMTP_USER;
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: user && pass ? { user, pass } : undefined,
    });
    await transporter.sendMail({
      from: resolveFromAddress(),
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  }

  return record;
}
