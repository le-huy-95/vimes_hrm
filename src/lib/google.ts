import { env, googleEnabled } from "../lib/env.js";
import { AppError } from "../lib/errors.js";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v3/userinfo";

export function assertGoogleEnabled() {
  if (!googleEnabled) {
    throw new AppError(
      503,
      "Google OAuth is not configured (set GOOGLE_CLIENT_ID/SECRET)",
    );
  }
}

export function buildGoogleAuthUrl(state: string): string {
  assertGoogleEnabled();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_WEB_CLIENT_ID,
    redirect_uri: env.GOOGLE_CALLBACK_URL,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string) {
  assertGoogleEnabled();
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_WEB_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_CALLBACK_URL,
    grant_type: "authorization_code",
  });
  const tokenRes = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => "");
    console.error("Google token exchange failed:", tokenRes.status, detail);
    throw new AppError(502, "Failed to exchange Google code");
  }
  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  const profileRes = await fetch(GOOGLE_USERINFO, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) {
    throw new AppError(502, "Failed to fetch Google profile");
  }
  const profile = (await profileRes.json()) as {
    sub: string;
    email: string;
    name?: string;
    email_verified?: boolean;
  };
  if (!profile.email) {
    throw new AppError(400, "Google account has no email");
  }

  return {
    googleUserId: profile.sub,
    email: profile.email,
    fullName: profile.name ?? profile.email,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : undefined,
    scope: tokens.scope,
  };
}
