import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { env, googleEnabled, googleServiceAccountEnabled } from "../lib/env.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { createDirectoryClient } from "../lib/google-directory.client.js";
import type { OauthRepository } from "../repositories/oauth.repository.js";
import type { WorkspaceSettingsRepository } from "../repositories/workspace-settings.repository.js";

const WORKSPACE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const WORKSPACE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
  "https://www.googleapis.com/auth/admin.directory.group.readonly",
].join(" ");

export type WorkspaceAuthStatus = {
  serviceAccountConfigured: boolean;
  oauthConnected: boolean;
  canSync: boolean;
};

export function signConnectState(payload: string): string {
  const sig = createHmac("sha256", env.JWT_ACCESS_SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyConnectState(signed: string): string {
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) throw new AppError(400, "Invalid state");
  const payload = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = createHmac("sha256", env.JWT_ACCESS_SECRET).update(payload).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError(400, "Invalid state");
  }
  return payload;
}

export function newConnectState(): string {
  return signConnectState(randomBytes(16).toString("hex"));
}

export class WorkspaceAuthService {
  constructor(
    private readonly oauth: OauthRepository,
    private readonly settings: WorkspaceSettingsRepository,
  ) {}

  async getAuthStatus(orgId: string, userId: string): Promise<WorkspaceAuthStatus> {
    const serviceAccountConfigured = googleServiceAccountEnabled;
    let oauthConnected = false;
    if (!serviceAccountConfigured) {
      const conn = await this.oauth.findWorkspaceForOrg(orgId, userId);
      oauthConnected = Boolean(conn);
    } else {
      const conn = await this.oauth.findWorkspaceForOrg(orgId, userId);
      oauthConnected = Boolean(conn);
    }
    return {
      serviceAccountConfigured,
      oauthConnected,
      canSync: serviceAccountConfigured || oauthConnected,
    };
  }

  buildConnectUrl(state: string): string {
    if (!googleEnabled) {
      throw new AppError(503, "Google OAuth is not configured");
    }
    const params = new URLSearchParams({
      client_id: env.GOOGLE_WEB_CLIENT_ID,
      redirect_uri: env.GOOGLE_WORKSPACE_CONNECT_CALLBACK_URL,
      response_type: "code",
      scope: WORKSPACE_SCOPES,
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `${WORKSPACE_AUTH_URL}?${params.toString()}`;
  }

  private async exchangeWorkspaceCode(code: string) {
    if (!googleEnabled) {
      throw new AppError(503, "Google OAuth is not configured");
    }
    const body = new URLSearchParams({
      code,
      client_id: env.GOOGLE_WEB_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_WORKSPACE_CONNECT_CALLBACK_URL,
      grant_type: "authorization_code",
    });
    const tokenRes = await fetch(WORKSPACE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokenRes.ok) {
      const detail = await tokenRes.text().catch(() => "");
      console.error("Workspace token exchange failed:", tokenRes.status, detail);
      throw new AppError(502, "Failed to exchange Workspace code");
    }
    return (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
  }

  async handleConnectCallback(code: string, orgId: string, userId: string) {
    const tokens = await this.exchangeWorkspaceCode(code);
    if (!tokens.access_token) throw new AppError(502, "Failed to exchange Workspace code");
    await this.oauth.upsertWorkspace({
      userId,
      accessTokenEnc: encrypt(tokens.access_token),
      refreshTokenEnc: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
      expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined,
      scope: tokens.scope ?? WORKSPACE_SCOPES,
    });
    await this.settings.updateSyncState(orgId, {
      authMode: "oauth_admin",
      workspaceOauthUserId: userId,
    });
    return { ok: true as const };
  }

  async resolveClientForOrg(orgId: string, actingUserId?: string) {
    if (googleServiceAccountEnabled) {
      return createDirectoryClient({});
    }
    const conn = await this.oauth.findWorkspaceForOrg(orgId, actingUserId);
    if (!conn) {
      throw new AppError(503, "Workspace not connected (Connect Workspace Admin or configure SA)");
    }
    return createDirectoryClient({
      oauth: {
        accessToken: decrypt(conn.accessTokenEnc),
        refreshToken: conn.refreshTokenEnc ? decrypt(conn.refreshTokenEnc) : null,
      },
    });
  }
}
