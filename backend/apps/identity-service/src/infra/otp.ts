import type { PrismaClient } from "@manage-teams/db";
import { AppError } from "@manage-teams/lib";
import { randomOtp, sha256 } from "../utils/crypto.js";
import type { AuthMailer } from "./mailer.js";

export type OtpPurpose = "verify_email" | "reset_password";

const GENERIC_FORGOT =
  "Nếu email tồn tại trong hệ thống, mã OTP đã được gửi đến hộp thư của bạn.";

export function getForgotPasswordMessage(): string {
  return GENERIC_FORGOT;
}

export class OtpService {
  constructor(
    private readonly db: PrismaClient,
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
    await this.db.otpChallenge.create({
      data: {
        email: opts.email.toLowerCase(),
        purpose: opts.purpose,
        codeHash,
        expiresAt,
      },
    });

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
    const row = await this.db.otpChallenge.findFirst({
      where: {
        email,
        purpose: opts.purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!row) {
      throw new AppError("OTP không hợp lệ hoặc đã hết hạn", "INVALID_OTP", 400);
    }
    if (row.attempts >= 5) {
      throw new AppError("OTP bị khóa tạm thời", "OTP_LOCKED", 429);
    }
    if (row.codeHash !== sha256(opts.code)) {
      await this.db.otpChallenge.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
      });
      throw new AppError("OTP không hợp lệ hoặc đã hết hạn", "INVALID_OTP", 400);
    }
    await this.db.otpChallenge.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });
  }
}
