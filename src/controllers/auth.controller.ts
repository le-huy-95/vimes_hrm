/**
 * AuthController — tầng HTTP của module xác thực.
 *
 * Nhiệm vụ: validate input (Zod), gọi AuthService, set status/response.
 * Không truy cập Prisma trực tiếp.
 */
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import { BaseController } from "./base.controller.js";
import type { AuthService } from "../services/auth.service.js";
import { REFRESH_COOKIE } from "../services/session.service.js";
import { buildGoogleAuthUrl, exchangeGoogleCode } from "../lib/google.js";
import { env, googleEnabled } from "../lib/env.js";
import { AppError } from "../lib/errors.js";
import type { AuthedRequest } from "../middleware/auth.js";
import {
  loginBodySchema,
  oauthCodeSchema,
  oauthStateSchema,
  registerBodySchema,
} from "../validators/auth.validators.js";

export class AuthController extends BaseController {
  constructor(private readonly authService: AuthService) {
    super();
  }

  // Handler public — đã bind sẵn để gắn vào Router
  readonly providers = this.bind(this.handleProviders);
  readonly register = this.bind(this.handleRegister);
  readonly login = this.bind(this.handleLogin);
  readonly refresh = this.bind(this.handleRefresh);
  readonly logout = this.bind(this.handleLogout);
  readonly me = this.bind(this.handleMe);
  readonly googleStart = this.bind(this.handleGoogleStart);
  readonly googleCallback = this.bind(this.handleGoogleCallback);

  /** UI hỏi Google login đã cấu hình chưa */
  private handleProviders(_req: Request, res: Response) {
    this.ok(res, {
      google: googleEnabled,
      googleLoginUrl: googleEnabled ? "/auth/google" : null,
      configured: {
        serverClientId: Boolean(
          env.GOOGLE_SERVER_CLIENT_ID || env.GOOGLE_CLIENT_ID,
        ),
        clientSecret: Boolean(env.GOOGLE_CLIENT_SECRET),
        iosClientId: Boolean(env.GOOGLE_IOS_CLIENT_ID),
      },
    });
  }

  /** Đăng ký email/password + tạo org mới → trả accessToken */
  private async handleRegister(req: Request, res: Response) {
    const body = registerBodySchema.parse(req.body);
    const session = await this.authService.registerLocal(res, body);
    this.created(res, session);
  }

  private async handleLogin(req: Request, res: Response) {
    const body = loginBodySchema.parse(req.body);
    const session = await this.authService.loginLocal(res, body);
    this.ok(res, session);
  }

  /** Đổi refresh cookie lấy accessToken mới */
  private async handleRefresh(req: Request, res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const session = await this.authService.refreshSession(res, raw);
    this.ok(res, session);
  }

  private async handleLogout(req: Request, res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await this.authService.logout(res, raw);
    this.noContent(res);
  }

  /** Thông tin user hiện tại (cần JWT) */
  private async handleMe(req: Request, res: Response) {
    const { user } = req as AuthedRequest;
    const me = await this.authService.getMe(user.sub);
    this.ok(res, me);
  }

  /** Bắt đầu OAuth: lưu state vào cookie chống CSRF rồi redirect Google */
  private handleGoogleStart(_req: Request, res: Response) {
    const state = randomBytes(16).toString("hex");
    res.cookie("oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.COOKIE_SECURE,
      maxAge: 10 * 60 * 1000,
      path: "/auth",
    });
    res.redirect(buildGoogleAuthUrl(state));
  }

  /**
   * Callback từ Google: kiểm tra state, đổi code → profile,
   * upsert user rồi redirect về frontend.
   * Lỗi OAuth trả về query ?error=... thay vì JSON (vì browser redirect).
   */
  private async handleGoogleCallback(req: Request, res: Response) {
    const fail = (reason: string) => {
      res.redirect(
        `${env.WEB_ORIGIN}/login?error=${encodeURIComponent(reason)}`,
      );
    };

    try {
      if (req.query.error) {
        return fail(String(req.query.error));
      }
      const code = oauthCodeSchema.parse(req.query.code);
      const state = oauthStateSchema.parse(req.query.state);
      const cookieState = req.cookies?.oauth_state as string | undefined;
      if (!cookieState || cookieState !== state) {
        return fail("oauth_state");
      }
      res.clearCookie("oauth_state", { path: "/auth" });
      const profile = await exchangeGoogleCode(code);
      await this.authService.upsertGoogleUser(res, profile);
      res.redirect(`${env.WEB_ORIGIN}/oauth/callback`);
    } catch (err) {
      const message =
        err instanceof AppError
          ? err.message
          : err instanceof ZodError
            ? "oauth_invalid"
            : "oauth_failed";
      console.error("Google OAuth callback error:", err);
      fail(message);
    }
  }
}
