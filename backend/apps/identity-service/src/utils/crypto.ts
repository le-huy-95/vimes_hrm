import { randomInt } from "node:crypto";
import * as argon2 from "argon2";

export { sha256, randomToken } from "@manage-teams/lib";

/** Hash mật khẩu bằng Argon2id. */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

/** Kiểm tra mật khẩu với hash đã lưu. */
export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

/** Sinh OTP số có độ dài cố định (mặc định 6). */
export function randomOtp(digits = 6): string {
  const max = 10 ** digits;
  return String(randomInt(0, max)).padStart(digits, "0");
}
