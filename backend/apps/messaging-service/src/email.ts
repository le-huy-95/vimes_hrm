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
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? "noreply@manage-teams.local",
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  }

  return record;
}
