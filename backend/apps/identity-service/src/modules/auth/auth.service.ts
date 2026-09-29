import { AppError, createLogger, sha256, verifyAccessToken } from "@manage-teams/lib";
import { prismaRead, prismaWrite } from "@manage-teams/db";
import { hashPassword } from "../../utils/crypto.js";
import { authMailer } from "../../infra/mailer.js";
import { OtpService, getForgotPasswordMessage } from "../../infra/otp.js";
import {
  linkGoogleToUser,
  linkGoogleToUserWithIdToken,
  setGoogleAccountPrimary,
} from "../../infra/google-accounts.js";
import { exchangeServerAuthCode } from "../../infra/google-oauth.js";
import { notifyGoogleTaskPull } from "../../infra/google-sync-notify.js";
import { issueTokens, jwtSecret } from "./token.service.js";
import { requireGoogleConfigured } from "../login/login.service.js";

const logger = createLogger("identity-service");
const otp = new OtpService(prismaWrite, authMailer);

export async function register(input: {
  email: string;
  password: string;
  displayName?: string;
}) {
  const email = input.email.toLowerCase();
  const passwordHash = await hashPassword(input.password);
  const user = await prismaWrite.user.create({
    data: {
      email,
      passwordHash,
      displayName: input.displayName ?? null,
    },
  });
  try {
    await otp.issueOtp({
      email,
      purpose: "verify_email",
      userName: input.displayName,
      userId: user.id,
    });
  } catch (mailErr) {
    logger.error({ mailErr }, "otp email failed after register");
    throw new AppError("Không gửi được email xác minh", "EMAIL_SEND_FAILED", 503);
  }
  return {
    userId: user.id,
    email,
    message: "Đăng ký thành công. Kiểm tra email để lấy mã xác minh Vimes.",
  };
}

export async function verifyEmail(email: string, code: string) {
  const normalized = email.toLowerCase();
  await otp.verifyOtp({ email: normalized, purpose: "verify_email", code });
  await prismaWrite.user.update({
    where: { email: normalized },
    data: { emailVerifiedAt: new Date() },
  });
  return { ok: true as const, message: "Email đã được xác minh trên Vimes." };
}

export async function resendOtp(email: string) {
  const normalized = email.toLowerCase();
  const user = await prismaRead.user.findUnique({ where: { email: normalized } });
  if (user) {
    await otp.issueOtp({
      email: normalized,
      purpose: "verify_email",
      userName: user.displayName ?? undefined,
      userId: user.id,
    });
  }
  return { message: "Nếu email tồn tại, mã xác minh đã được gửi." };
}

export async function forgotPassword(email: string) {
  const normalized = email.toLowerCase();
  const user = await prismaRead.user.findUnique({ where: { email: normalized } });
  if (user) {
    try {
      await otp.issueOtp({
        email: normalized,
        purpose: "reset_password",
        userName: user.displayName ?? undefined,
        userId: user.id,
      });
    } catch (mailErr) {
      logger.error({ mailErr }, "forgot password mail failed");
    }
  }
  return { message: getForgotPasswordMessage() };
}

export async function resetPassword(email: string, code: string, newPassword: string) {
  const normalized = email.toLowerCase();
  await otp.verifyOtp({ email: normalized, purpose: "reset_password", code });
  const passwordHash = await hashPassword(newPassword);
  const user = await prismaWrite.user.update({
    where: { email: normalized },
    data: {
      passwordHash,
      tokenVersion: { increment: 1 },
    },
  });
  await prismaWrite.refreshToken.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return { ok: true as const, message: "Mật khẩu Vimes đã được cập nhật." };
}

/** Xoay vòng refresh token: revoke token cũ, phát cặp access+refresh mới. */
export async function refreshSession(rawRefreshToken: string) {
  const tokenHash = sha256(rawRefreshToken);
  const existing = await prismaRead.refreshToken.findFirst({
    where: { tokenHash, revokedAt: null },
  });
  if (!existing) {
    throw new AppError("Refresh token không hợp lệ", "INVALID_REFRESH_TOKEN", 401);
  }
  if (existing.expiresAt.getTime() <= Date.now()) {
    await prismaWrite.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    throw new AppError("Refresh token đã hết hạn", "REFRESH_TOKEN_EXPIRED", 401);
  }

  const user = await prismaRead.user.findUnique({
    where: { id: existing.userId },
    select: { id: true, email: true, tokenVersion: true },
  });
  if (!user) {
    throw new AppError("Refresh token không hợp lệ", "INVALID_REFRESH_TOKEN", 401);
  }

  await prismaWrite.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  const tokens = await issueTokens({
    id: user.id,
    email: user.email,
    token_version: user.tokenVersion,
  });
  return {
    user: { id: user.id, email: user.email },
    ...tokens,
  };
}

export async function getMe(authorizationHeader: string | undefined) {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new AppError("Chưa xác thực", "UNAUTHORIZED", 401);
  }
  const payload = await verifyAccessToken(authorizationHeader.slice(7), jwtSecret);
  const sub = String(payload.sub);
  const user = await prismaRead.user.findUnique({
    where: { id: sub },
    select: {
      id: true,
      email: true,
      displayName: true,
      emailVerifiedAt: true,
      tokenVersion: true,
    },
  });
  if (!user) throw new AppError("Chưa xác thực", "UNAUTHORIZED", 401);
  if (payload.tv !== undefined && payload.tv !== user.tokenVersion) {
    throw new AppError("Token đã hết hiệu lực", "TOKEN_REVOKED", 401);
  }
  const googleAccounts = await prismaRead.userGoogleAccount.findMany({
    where: { userId: sub },
    orderBy: [{ isPrimary: "desc" }, { linkedAt: "asc" }],
    select: {
      googleSub: true,
      email: true,
      accountType: true,
      isPrimary: true,
      linkedAt: true,
    },
  });
  return {
    user: {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      email_verified_at: user.emailVerifiedAt,
      token_version: user.tokenVersion,
    },
    googleAccounts: googleAccounts.map((g) => ({
      google_sub: g.googleSub,
      email: g.email,
      account_type: g.accountType,
      is_primary: g.isPrimary,
      linked_at: g.linkedAt,
    })),
  };
}

async function requireBearerUserId(authorizationHeader: string | undefined): Promise<string> {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new AppError("Chưa xác thực", "UNAUTHORIZED", 401);
  }
  const payload = await verifyAccessToken(authorizationHeader.slice(7), jwtSecret);
  return String(payload.sub);
}

/** Link Google to an already-authenticated session (not login) — PKCE web flow. */
export async function googleLink(
  authorizationHeader: string | undefined,
  input: { code: string; codeVerifier: string; redirectUri: string },
) {
  requireGoogleConfigured();
  const userId = await requireBearerUserId(authorizationHeader);
  const { claims, tasksSyncReady } = await linkGoogleToUser(prismaWrite, userId, input);
  notifyGoogleTaskPull(userId);
  return {
    ok: true as const,
    google: {
      sub: claims.sub,
      accountType: claims.hd ? "workspace" : "personal",
      email: claims.email,
      tasksSyncReady,
    },
    message: "Đã liên kết Google với tài khoản Vimes.",
  };
}

/** Link Google from Flutter Google Sign-In (idToken and/or GIS popup serverAuthCode). */
export async function googleLinkIdToken(
  authorizationHeader: string | undefined,
  input: { idToken?: string; serverAuthCode?: string; redirectUri?: string },
) {
  requireGoogleConfigured();
  const userId = await requireBearerUserId(authorizationHeader);
  let idToken = input.idToken;
  let refreshToken: string | null = null;
  if (input.serverAuthCode) {
    try {
      const exchanged = await exchangeServerAuthCode({
        serverAuthCode: input.serverAuthCode,
        redirectUri: input.redirectUri,
      });
      refreshToken = exchanged.refreshToken ?? null;
      idToken = idToken ?? exchanged.idToken;
      if (!refreshToken) {
        logger.warn("link-id-token: no refresh_token — user may need re-consent");
      }
    } catch (err) {
      logger.warn({ err }, "link-id-token: serverAuthCode exchange failed");
      if (!idToken) {
        throw new AppError(
          "Không đổi được mã Google (serverAuthCode). Kiểm tra GOOGLE_CLIENT_SECRET và redirect_uri=postmessage.",
          "GOOGLE_EXCHANGE_FAILED",
          401,
        );
      }
    }
  }
  if (!idToken) {
    throw new AppError("Thiếu Google idToken", "GOOGLE_TOKEN_MISSING", 400);
  }
  const { claims, tasksSyncReady } = await linkGoogleToUserWithIdToken(
    prismaWrite,
    userId,
    idToken,
    refreshToken,
  );
  notifyGoogleTaskPull(userId);
  return {
    ok: true as const,
    google: {
      sub: claims.sub,
      accountType: claims.hd ? "workspace" : "personal",
      email: claims.email,
      tasksSyncReady,
    },
    message: tasksSyncReady
      ? "Đã liên kết Google — đồng bộ Tasks/Sheets sẵn sàng."
      : "Đã liên kết Google. Cần cấp quyền lại để đồng bộ Tasks/Sheets.",
  };
}

export async function googleSetPrimary(
  authorizationHeader: string | undefined,
  googleSub: string,
) {
  requireGoogleConfigured();
  const userId = await requireBearerUserId(authorizationHeader);
  const result = await setGoogleAccountPrimary(prismaWrite, userId, googleSub);
  notifyGoogleTaskPull(userId);
  return {
    ok: true as const,
    google: {
      sub: result.googleSub,
      email: result.email,
      isPrimary: true,
    },
    message:
      "Đã đổi Primary Google. Liên kết Tasks/Sheets/Chat Google cũ đã được gỡ — đồng bộ lại với tài khoản mới.",
  };
}
