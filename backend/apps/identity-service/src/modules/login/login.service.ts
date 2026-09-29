import { randomBytes } from "node:crypto";
import { AppError, createLogger } from "@manage-teams/lib";
import { prismaRead, prismaWrite } from "@manage-teams/db";
import { verifyPassword } from "../../utils/crypto.js";
import {
  isGoogleOAuthConfigured,
  buildGoogleAuthorizeUrl,
  exchangeServerAuthCode,
} from "../../infra/google-oauth.js";
import { resolveGoogleIdTokenLogin, resolveGoogleLogin } from "../../infra/google-accounts.js";
import { issueTokens } from "../auth/token.service.js";
import { notifyGoogleTaskPull } from "../../infra/google-sync-notify.js";

const logger = createLogger("identity-service");

export function requireGoogleConfigured(): void {
  if (!isGoogleOAuthConfigured()) {
    throw new AppError("Google OAuth chưa được cấu hình", "GOOGLE_NOT_CONFIGURED", 503);
  }
}

/** Email/password login — issues JWT pair. */
export async function loginWithPassword(email: string, password: string) {
  const normalized = email.toLowerCase();
  const user = await prismaRead.user.findUnique({ where: { email: normalized } });
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
    throw new AppError("Email hoặc mật khẩu không đúng", "INVALID_CREDENTIALS", 401);
  }
  if (!user.emailVerifiedAt) {
    throw new AppError("Email chưa xác minh", "EMAIL_NOT_VERIFIED", 403);
  }
  const tokens = await issueTokens({
    id: user.id,
    email: user.email,
    token_version: user.tokenVersion,
  });
  notifyGoogleTaskPull(user.id);
  return { user: { id: user.id, email: user.email }, ...tokens };
}

export async function buildAuthorizeUrl(input: {
  redirectUri: string;
  codeChallenge: string;
  state?: string;
}) {
  requireGoogleConfigured();
  const state = input.state ?? randomBytes(16).toString("base64url");
  const authorizationUrl = buildGoogleAuthorizeUrl({
    redirectUri: input.redirectUri,
    state,
    codeChallenge: input.codeChallenge,
  });
  return { authorizationUrl, state };
}

export async function loginWithGoogleCode(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}) {
  requireGoogleConfigured();
  const { user, claims, created } = await resolveGoogleLogin(prismaWrite, input);
  const tokens = await issueTokens(user);
  notifyGoogleTaskPull(user.id);
  return {
    user: { id: user.id, email: user.email },
    google: {
      sub: claims.sub,
      accountType: claims.hd ? "workspace" : "personal",
      email: claims.email,
    },
    created,
    ...tokens,
  };
}

export async function loginWithGoogleIdToken(
  idToken: string | undefined,
  serverAuthCode?: string,
  redirectUri?: string,
) {
  requireGoogleConfigured();
  let resolvedIdToken = idToken;
  let refreshToken: string | null = null;
  if (serverAuthCode) {
    try {
      const exchanged = await exchangeServerAuthCode({
        serverAuthCode,
        redirectUri,
      });
      refreshToken = exchanged.refreshToken ?? null;
      resolvedIdToken = resolvedIdToken ?? exchanged.idToken;
      if (!refreshToken) {
        logger.warn("serverAuthCode exchanged but no refresh_token — user may need re-consent");
      }
    } catch (err) {
      logger.warn({ err }, "serverAuthCode exchange failed — continue login without Tasks refresh");
      if (!resolvedIdToken) {
        throw new AppError(
          "Không đổi được mã Google (serverAuthCode). Kiểm tra GOOGLE_CLIENT_SECRET và redirect_uri=postmessage.",
          "GOOGLE_EXCHANGE_FAILED",
          401,
        );
      }
    }
  }
  if (!resolvedIdToken) {
    throw new AppError("Thiếu Google idToken", "GOOGLE_TOKEN_MISSING", 400);
  }
  const { user, claims, created } = await resolveGoogleIdTokenLogin(
    prismaWrite,
    resolvedIdToken,
    refreshToken,
  );
  const tokens = await issueTokens(user);
  notifyGoogleTaskPull(user.id);
  return {
    user: { id: user.id, email: user.email },
    google: {
      sub: claims.sub,
      accountType: claims.hd ? "workspace" : "personal",
      email: claims.email,
      tasksSyncReady: Boolean(refreshToken),
    },
    created,
    ...tokens,
  };
}
