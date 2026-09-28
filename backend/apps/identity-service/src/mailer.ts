const messagingUrl = process.env.MESSAGING_URL ?? "http://localhost:3206";
const internalToken = process.env.INTERNAL_SERVICE_TOKEN ?? "dev-internal-token";

async function post(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${messagingUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": internalToken,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`messaging ${path} failed: ${res.status} ${text}`);
  }
}

export type AuthMailer = {
  sendOtp(data: {
    to: string;
    userName?: string;
    otpCode: string;
    expiryMinutes: number;
    userId?: string;
  }): Promise<void>;
  sendPasswordResetOtp(data: {
    to: string;
    userName?: string;
    otpCode: string;
    expiryMinutes: number;
    userId?: string;
  }): Promise<void>;
};

export const authMailer: AuthMailer = {
  sendOtp: (data) => post("/internal/email/otp", data),
  sendPasswordResetOtp: (data) => post("/internal/email/password-reset-otp", data),
};
