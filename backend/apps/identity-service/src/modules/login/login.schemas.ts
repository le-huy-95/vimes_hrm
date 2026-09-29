import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const GoogleAuthorizeSchema = z.object({
  redirectUri: z.string().min(1).max(2048),
  codeChallenge: z.string().min(43).max(128),
  state: z.string().min(8).max(128).optional(),
});

export const GoogleCodeSchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(43).max(128),
  redirectUri: z.string().min(1).max(2048),
});

export const GoogleIdTokenSchema = z
  .object({
    idToken: z.string().min(20).optional(),
    /** Server auth code từ Google Sign-In / GIS popup — đổi thành refresh + idToken. */
    serverAuthCode: z.string().min(10).optional(),
    redirectUri: z.string().min(1).max(2048).optional(),
  })
  .refine((v) => Boolean(v.idToken || v.serverAuthCode), {
    message: "idToken hoặc serverAuthCode bắt buộc",
  });
