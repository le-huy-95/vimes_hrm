/**
 * AuthService — nghiệp vụ đăng ký / đăng nhập / OAuth / session.
 *
 * Không set HTTP status; chỉ ném AppError hoặc trả data.
 * Truy cập DB qua Repository; dùng withTx() khi cần transaction.
 */
import type { Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { encrypt } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { hashToken } from "../lib/tokens.js";
import type { UserRepository } from "../repositories/user.repository.js";
import type { OrgRepository } from "../repositories/org.repository.js";
import type { OauthRepository } from "../repositories/oauth.repository.js";
import type { RefreshTokenRepository } from "../repositories/refresh-token.repository.js";
import type { SessionService } from "./session.service.js";

/** Profile chuẩn hóa sau khi đổi code Google */
export type GoogleProfile = {
  googleUserId: string;
  email: string;
  fullName: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
};

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly users: UserRepository,
    private readonly orgs: OrgRepository,
    private readonly oauth: OauthRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Đăng ký local: tạo Organization + User trong 1 transaction,
   * rồi phát accessToken + refresh cookie.
   */
  async registerLocal(
    res: Response,
    input: {
      email: string;
      password: string;
      fullName: string;
      orgName: string;
    },
  ) {
    const existing = await this.users.findByEmail(input.email);
    if (existing) throw new AppError(409, "Email already registered");

    const passwordHash = await hashPassword(input.password);
    // Transaction: tạo org fail thì không tạo user (và ngược lại)
    const user = await this.prisma.$transaction(async (tx) => {
      const orgs = this.orgs.withTx(tx);
      const users = this.users.withTx(tx);
      const org = await orgs.create({ name: input.orgName });
      return users.create({
        email: input.email.toLowerCase(),
        fullName: input.fullName,
        passwordHash,
        orgId: org.id,
      });
    });

    return this.sessions.issueSession(res, user);
  }

  async loginLocal(
    res: Response,
    input: { email: string; password: string },
  ) {
    const user = await this.users.findByEmail(input.email);
    // Không tiết lộ email có tồn tại hay không → cùng message
    if (!user?.passwordHash) {
      throw new AppError(401, "Invalid email or password");
    }
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw new AppError(401, "Invalid email or password");
    return this.sessions.issueSession(res, user);
  }

  async refreshSession(res: Response, rawRefresh?: string) {
    if (!rawRefresh) throw new AppError(401, "Missing refresh token");
    try {
      return await this.sessions.rotateRefresh(rawRefresh, res);
    } catch {
      this.sessions.clearRefreshCookie(res);
      throw new AppError(401, "Invalid refresh token");
    }
  }

  /** Thu hồi refresh token (nếu có) và xóa cookie */
  async logout(res: Response, rawRefresh?: string) {
    if (rawRefresh) {
      await this.refreshTokens.revokeByHash(hashToken(rawRefresh));
    }
    this.sessions.clearRefreshCookie(res);
  }

  /**
   * Đăng nhập Google:
   * - User mới → tạo org + user
   * - User đã có email nhưng chưa link Google → gắn googleUserId
   * - Luôn upsert OAuth connection (token mã hóa)
   */
  async upsertGoogleUser(res: Response, profile: GoogleProfile) {
    const email = profile.email.toLowerCase();
    let user = await this.users.findByGoogleOrEmail(
      profile.googleUserId,
      email,
    );

    if (!user) {
      user = await this.prisma.$transaction(async (tx) => {
        const orgs = this.orgs.withTx(tx);
        const users = this.users.withTx(tx);
        const org = await orgs.create({
          name: `${profile.fullName}'s Org`,
        });
        return users.create({
          email,
          fullName: profile.fullName,
          googleUserId: profile.googleUserId,
          orgId: org.id,
        });
      });
    } else if (!user.googleUserId) {
      user = await this.users.updateGoogleUserId(
        user.id,
        profile.googleUserId,
      );
    }

    await this.oauth.upsertGoogle({
      userId: user.id,
      accessTokenEnc: encrypt(profile.accessToken),
      refreshTokenEnc: profile.refreshToken
        ? encrypt(profile.refreshToken)
        : null,
      expiresAt: profile.expiresAt,
      scope: profile.scope,
    });

    return this.sessions.issueSession(res, user);
  }

  async getMe(userId: string) {
    const user = await this.users.findByIdWithOrg(userId);
    if (!user) throw new AppError(404, "User not found");
    return user;
  }
}
