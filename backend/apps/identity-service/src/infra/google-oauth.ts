import { createRemoteJWKSet, jwtVerify } from "jose";
import { ensureBackendEnvLoaded } from "@manage-teams/lib";

ensureBackendEnvLoaded();

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/** Scope mặc định: đăng nhập + Tasks + Sheets/Drive.file (Phase 2–4). */
export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
] as const;

export type GoogleIdClaims = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  hd?: string;
  picture?: string;
};

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID);
}

export function buildGoogleAuthorizeUrl(opts: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes?: string[];
}): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not set");
  }
  const scopes = (opts.scopes ?? [...GOOGLE_OAUTH_SCOPES]).join(" ");
  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("code_challenge", opts.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export async function exchangeAuthorizationCode(opts: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<{ idToken: string; refreshToken?: string; accessToken: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not set");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: clientId,
    code_verifier: opts.codeVerifier,
  });
  if (process.env.GOOGLE_CLIENT_SECRET) {
    body.set("client_secret", process.env.GOOGLE_CLIENT_SECRET);
  }

  return postToken(body);
}

/**
 * Đổi serverAuthCode từ Google Sign-In (Flutter/mobile) → refresh token.
 * Cần GOOGLE_CLIENT_ID = Web client ID (serverClientId) + GOOGLE_CLIENT_SECRET.
 */
export async function exchangeServerAuthCode(opts: {
  serverAuthCode: string;
  /** GIS web popup UX requires `postmessage`. Mobile serverAuthCode omits this. */
  redirectUri?: string;
}): Promise<{ refreshToken?: string; accessToken: string; idToken?: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not set");
  if (!clientSecret) {
    throw new Error("GOOGLE_CLIENT_SECRET is required to exchange serverAuthCode");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.serverAuthCode,
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (opts.redirectUri) {
    body.set("redirect_uri", opts.redirectUri);
  }

  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google serverAuthCode exchange failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as {
    refresh_token?: string;
    access_token?: string;
    id_token?: string;
  };
  if (!json.access_token) {
    throw new Error("Google token response missing access_token");
  }
  return {
    refreshToken: json.refresh_token,
    accessToken: json.access_token,
    idToken: json.id_token,
  };
}

async function postToken(body: URLSearchParams): Promise<{
  idToken: string;
  refreshToken?: string;
  accessToken: string;
}> {
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as {
    id_token?: string;
    refresh_token?: string;
    access_token?: string;
  };
  if (!json.id_token || !json.access_token) {
    throw new Error("Google token response missing id_token/access_token");
  }
  return {
    idToken: json.id_token,
    refreshToken: json.refresh_token,
    accessToken: json.access_token,
  };
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdClaims> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not set");

  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
  });

  const email = String(payload.email ?? "");
  const sub = String(payload.sub ?? "");
  if (!email || !sub) {
    throw new Error("Google id_token missing email/sub");
  }

  return {
    sub,
    email: email.toLowerCase(),
    email_verified: Boolean(payload.email_verified),
    name: payload.name ? String(payload.name) : undefined,
    hd: payload.hd ? String(payload.hd) : undefined,
    picture: payload.picture ? String(payload.picture) : undefined,
  };
}

export function accountTypeFromClaims(claims: Pick<GoogleIdClaims, "hd">): "workspace" | "personal" {
  return claims.hd ? "workspace" : "personal";
}
