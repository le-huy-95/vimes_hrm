import type { Db } from "@manage-teams/db";
import { AppError } from "@manage-teams/common";
import { randomOtp, sha256 } from "./crypto.js";
import type { AuthMailer } from "./mailer.js";

export type OtpPurpose = "verify_email" | "reset_password";

const GENERIC_FORGOT =
  "Nếu email tồn tại trong hệ thống, mã OTP đã được gửi đến hộp thư của bạn.";

export function getForgotPasswordMessage(): string {
  return GENERIC_FORGOT;
}

export class OtpService {
  constructor(
    private readonly db: Db,
    private readonly mailer: AuthMailer,
    private readonly expiryMinutes = Number(process.env.OTP_EXPIRES_MINUTES ?? 10),
  ) {}

  async issueOtp(opts: {
    email: string;
    purpose: OtpPurpose;
    userName?: string;
    userId?: string;
  }): Promise<string> {
    const code = randomOtp(6);
    const codeHash = sha256(code);
    const expiresAt = new Date(Date.now() + this.expiryMinutes * 60_000);
    await this.db.query(
      `INSERT INTO otp_challenges (email, purpose, code_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [opts.email.toLowerCase(), opts.purpose, codeHash, expiresAt.toISOString()],
    );

    if (process.env.NODE_ENV === "development") {
      console.info(`[dev] OTP ${opts.purpose} for ${opts.email}: ${code}`);
    }

    if (opts.purpose === "reset_password") {
      await this.mailer.sendPasswordResetOtp({
        to: opts.email,
        userName: opts.userName,
        otpCode: code,
        expiryMinutes: this.expiryMinutes,
        userId: opts.userId,
      });
    } else {
      await this.mailer.sendOtp({
        to: opts.email,
        userName: opts.userName,
        otpCode: code,
        expiryMinutes: this.expiryMinutes,
        userId: opts.userId,
      });
    }
    return code;
  }

  async verifyOtp(opts: {
    email: string;
    purpose: OtpPurpose;
    code: string;
  }): Promise<void> {
    const email = opts.email.toLowerCase();
    const { rows } = await this.db.query<{
      id: string;
      code_hash: string;
      attempts: number;
    }>(
      `SELECT id, code_hash, attempts FROM otp_challenges
       WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [email, opts.purpose],
    );
    const row = rows[0];
    if (!row) {
      throw new AppError("OTP không hợp lệ hoặc đã hết hạn", "INVALID_OTP", 400);
    }
    if (row.attempts >= 5) {
      throw new AppError("OTP bị khóa tạm thời", "OTP_LOCKED", 429);
    }
    if (row.code_hash !== sha256(opts.code)) {
      await this.db.query(`UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1`, [
        row.id,
      ]);
      throw new AppError("OTP không hợp lệ hoặc đã hết hạn", "INVALID_OTP", 400);
    }
    await this.db.query(`UPDATE otp_challenges SET consumed_at = now() WHERE id = $1`, [row.id]);
  }
}
