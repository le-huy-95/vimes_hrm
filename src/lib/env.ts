import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .length(64)
    .regex(/^[0-9a-fA-F]+$/, "TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes)"),
  /** Web/server OAuth client (preferred for Express code flow) */
  GOOGLE_SERVER_CLIENT_ID: z.string().optional().default(""),
  /** Alias; used if GOOGLE_SERVER_CLIENT_ID empty */
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  /** iOS native Sign-In (future mobile app) */
  GOOGLE_IOS_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_IOS_URL_SCHEME: z.string().optional().default(""),
  GOOGLE_CALLBACK_URL: z
    .string()
    .default("http://localhost:3001/auth/google/callback"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

const parsed = envSchema.parse(process.env);

/** Client ID dùng cho web OAuth (server client ưu tiên). */
const googleWebClientId =
  parsed.GOOGLE_SERVER_CLIENT_ID || parsed.GOOGLE_CLIENT_ID;

export const env = {
  ...parsed,
  /** Resolved web client id for OAuth authorize + token exchange */
  GOOGLE_WEB_CLIENT_ID: googleWebClientId,
};

export const googleEnabled =
  Boolean(env.GOOGLE_WEB_CLIENT_ID) && Boolean(env.GOOGLE_CLIENT_SECRET);
