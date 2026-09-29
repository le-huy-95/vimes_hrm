import { createHash, randomBytes } from "node:crypto";

/** Băm SHA-256 hex — dùng cho OTP hash, token hash, v.v. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Sinh token ngẫu nhiên dạng base64url (mời org, refresh, …). */
export function randomToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}
