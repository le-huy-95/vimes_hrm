/**
 * SessionService — phát / xoay vòng access + refresh token, gắn cookie.
 *
 * Access token: JWT ngắn hạn (header Authorization).
 * Refresh token: random string, chỉ lưu hash trong DB, raw nằm trong httpOnly cookie.
 */
import type { Response } from "express";
import { env } from "../lib/env.js";
import {
  createRefreshTokenRaw,
  hashToken,
  signAccessToken,
  type AccessPayload,
} from "../lib/tokens.js";
import type { RefreshTokenRepository } from "../repositories/refresh-token.repository.js";

/** Tên cookie chứa refresh token thô (raw) */
export const REFRESH_COOKIE = "refresh_token";

export class SessionService {
  constructor(private readonly refreshTokens: RefreshTokenRepository) {}

  setRefreshCookie(res: Response, raw: string, expiresAt: Date) {
    res.cookie(REFRESH_COOKIE, raw, {
      httpOnly: true, // JS frontend không đọc được → giảm XSS
      secure: env.COOKIE_SECURE,
      sameSite: "lax",
      path: "/auth", // chỉ gửi kèm request /auth/*
      expires: expiresAt,
    });
  }

  clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: "lax",
      path: "/auth",
    });
  }

  /** Tạo cặp access + refresh mới cho user */
  async issueSession(
    res: Response,
    user: { id: string; orgId: string; email: string },
  ) {
    const payload: AccessPayload = {
      sub: user.id,
      orgId: user.orgId,
      email: user.email,
    };
    const accessToken = signAccessToken(payload);
    const refresh = createRefreshTokenRaw();
    await this.refreshTokens.create({
      userId: user.id,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
    });
    this.setRefreshCookie(res, refresh.raw, refresh.expiresAt);
    return { accessToken, user: payload };
  }

  /**
   * Rotate refresh: thu hồi token cũ, phát session mới.
   * Nếu hash không hợp lệ / hết hạn → throw để AuthService trả 401.
   */
  async rotateRefresh(raw: string, res: Response) {
    const tokenHash = hashToken(raw);
    const existing = await this.refreshTokens.findActiveByHash(tokenHash);
    if (!existing || existing.expiresAt < new Date()) {
      throw new Error("INVALID_REFRESH");
    }
    await this.refreshTokens.revoke(existing.id);
    return this.issueSession(res, existing.user);
  }
}
