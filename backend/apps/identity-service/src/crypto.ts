import { createHash, randomBytes, randomInt } from "node:crypto";
import * as argon2 from "argon2";

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomOtp(digits = 6): string {
  const max = 10 ** digits;
  return String(randomInt(0, max)).padStart(digits, "0");
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}
