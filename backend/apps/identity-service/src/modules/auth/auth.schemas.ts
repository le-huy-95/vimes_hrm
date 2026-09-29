import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).optional(),
});

export const VerifySchema = z.object({
  email: z.string().email(),
  code: z.string().min(4),
});

export const ForgotSchema = z.object({ email: z.string().email() });

export const RefreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export const ResetSchema = z.object({
  email: z.string().email(),
  code: z.string().min(4),
  newPassword: z.string().min(8),
});

export const GoogleCodeSchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(43).max(128),
  redirectUri: z.string().min(1).max(2048),
});

/** Flutter: liên kết Google khi đã đăng nhập Vimes (idToken và/hoặc GIS popup code). */
export const GoogleIdTokenLinkSchema = z
  .object({
    idToken: z.string().min(20).optional(),
    serverAuthCode: z.string().min(10).optional(),
    /** GIS web popup → `postmessage`; mobile omit. */
    redirectUri: z.string().min(1).max(2048).optional(),
  })
  .refine((v) => Boolean(v.idToken || v.serverAuthCode), {
    message: "idToken hoặc serverAuthCode bắt buộc",
  });
