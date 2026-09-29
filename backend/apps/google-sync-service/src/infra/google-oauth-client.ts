import { google } from "googleapis";
import { prismaRead } from "@manage-teams/db";
import { AppError } from "@manage-teams/lib";
import { decryptSecret } from "./secret-box.js";
import {
  clearCachedAccessToken,
  getCachedAccessToken,
  setCachedAccessToken,
} from "./oauth-token-cache.js";

type GoogleOAuth2 = InstanceType<typeof google.auth.OAuth2>;

/** OAuth2 client cho Sheets/Drive (cùng refresh token identity). */
export async function getGoogleOAuthForUser(
  userId: string,
): Promise<{ oauth2: GoogleOAuth2; accountId: string }> {
  const account = await prismaRead.userGoogleAccount.findFirst({
    where: { userId, isPrimary: true },
  });
  if (!account?.refreshTokenEnc) {
    throw new AppError(
      "User chưa liên kết Google / thiếu refresh token",
      "AUTH_REQUIRED",
      401,
    );
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new AppError("GOOGLE_CLIENT_ID/SECRET chưa cấu hình", "CONFIG", 500);
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(account.refreshTokenEnc);
  } catch {
    throw new AppError(
      "Không giải mã được Google refresh token",
      "AUTH_REQUIRED",
      401,
    );
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  const cached = getCachedAccessToken(`sheets:${userId}`);
  if (cached) {
    oauth2.setCredentials({
      access_token: cached,
      refresh_token: refreshToken,
    });
  } else {
    oauth2.setCredentials({ refresh_token: refreshToken });
    try {
      const tok = await oauth2.getAccessToken();
      if (tok.token) setCachedAccessToken(`sheets:${userId}`, tok.token);
    } catch (err) {
      clearCachedAccessToken(`sheets:${userId}`);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("invalid_grant")) {
        throw new AppError(msg, "AUTH_REQUIRED", 401);
      }
      throw err;
    }
  }
  return { oauth2, accountId: account.id };
}

export function sheetsClient(auth: GoogleOAuth2) {
  return google.sheets({ version: "v4", auth });
}

export function driveClient(auth: GoogleOAuth2) {
  return google.drive({ version: "v3", auth });
}
