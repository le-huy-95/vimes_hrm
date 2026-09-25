import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "./env.js";

export type AccessPayload = {
  sub: string;
  orgId: string;
  email: string;
};

const ACCESS_TTL = "15m";
const REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
}

export function createRefreshTokenRaw(): {
  raw: string;
  hash: string;
  expiresAt: Date;
} {
  const raw = randomBytes(32).toString("hex");
  return {
    raw,
    hash: hashToken(raw),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
