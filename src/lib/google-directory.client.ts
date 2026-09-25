import { readFileSync } from "node:fs";
import { OAuth2Client, JWT } from "google-auth-library";
import { google } from "googleapis";
import { env, googleServiceAccountEnabled } from "./env.js";
import { AppError } from "./errors.js";

const SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
  "https://www.googleapis.com/auth/admin.directory.group.readonly",
];

export type DirectoryUser = {
  googleUserId: string;
  primaryEmail: string;
  fullName: string;
  orgUnit: string | null;
  photoUrl: string | null;
  suspended: boolean;
};

export type DirectoryGroup = {
  googleGroupId: string;
  email: string;
  name: string;
};

function toAuthError(err: unknown): never {
  const status = (err as { code?: number; response?: { status?: number } })?.code
    ?? (err as { response?: { status?: number } })?.response?.status;
  if (status === 401 || status === 403) {
    throw new AppError(503, "Workspace admin authorization failed (check scopes/domain-wide delegation)");
  }
  throw err;
}

function resolveServiceAccountKey(): Record<string, string> {
  const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON.trim();
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(readFileSync(raw, "utf8"));
    } catch {
      throw new AppError(503, "Invalid GOOGLE_SERVICE_ACCOUNT_JSON (must be JSON string or readable file path)");
    }
  }
}

function buildAuth(opts?: { oauth?: { accessToken: string; refreshToken?: string | null } }): OAuth2Client | JWT {
  if (googleServiceAccountEnabled) {
    const keys = resolveServiceAccountKey();
    return new JWT({
      email: keys.client_email,
      key: keys.private_key,
      subject: env.GOOGLE_WORKSPACE_ADMIN_EMAIL,
      scopes: SCOPES,
    });
  }
  if (opts?.oauth?.accessToken) {
    const client = new OAuth2Client(env.GOOGLE_WEB_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
    client.setCredentials({
      access_token: opts.oauth.accessToken,
      refresh_token: opts.oauth.refreshToken ?? undefined,
    });
    return client as unknown as OAuth2Client;
  }
  throw new AppError(503, "Configure SA or Connect Workspace Admin");
}

export type GoogleDirectoryClient = {
  listUsersPage: (args?: { syncToken?: string; pageToken?: string; maxResults?: number }) => Promise<{ users: DirectoryUser[]; nextPageToken?: string; nextSyncToken?: string }>;
  listGroupsPage: (args?: { pageToken?: string; maxResults?: number }) => Promise<{ groups: DirectoryGroup[]; nextPageToken?: string }>;
};

export async function createDirectoryClient(opts?: {
  oauth?: { accessToken: string; refreshToken?: string | null };
}): Promise<GoogleDirectoryClient> {
  const auth = buildAuth(opts);
  const admin = google.admin({ version: "directory_v1", auth: auth as never });

  return {
    async listUsersPage(args = {}) {
      try {
        const res = await admin.users.list({
          customer: "my_customer",
          maxResults: args.maxResults ?? 200,
          pageToken: args.pageToken,
          projection: "FULL",
          orderBy: "EMAIL",
          ...(args.syncToken ? { syncToken: args.syncToken } : {}),
        } as never) as unknown as { data: {
          users?: Array<{
            id?: string | null; primaryEmail?: string | null;
            name?: { fullName?: string | null } | null;
            orgUnitPath?: string | null; thumbnailPhotoUrl?: string | null;
            suspended?: boolean | null;
          }> | null;
          nextPageToken?: string | null; nextSyncToken?: string | null;
        } };
        const users: DirectoryUser[] = (res.data.users ?? [])
          .filter((u) => u.id && u.primaryEmail)
          .map((u) => ({
            googleUserId: u.id as string,
            primaryEmail: u.primaryEmail as string,
            fullName: u.name?.fullName ?? (u.primaryEmail as string),
            orgUnit: u.orgUnitPath ?? null,
            photoUrl: u.thumbnailPhotoUrl ?? null,
            suspended: u.suspended ?? false,
          }));
        return {
          users,
          nextPageToken: res.data.nextPageToken ?? undefined,
          nextSyncToken: res.data.nextSyncToken ?? undefined,
        };
      } catch (err) {
        toAuthError(err);
      }
    },
    async listGroupsPage(args = {}) {
      try {
        const res = (await admin.groups.list({
          customer: "my_customer",
          maxResults: args.maxResults ?? 200,
          pageToken: args.pageToken,
        } as never)) as unknown as { data: {
          groups?: Array<{ id?: string | null; email?: string | null; name?: string | null }> | null;
          nextPageToken?: string | null;
        } };
        const groups: DirectoryGroup[] = (res.data.groups ?? [])
          .filter((g) => g.id && g.email)
          .map((g) => ({
            googleGroupId: g.id as string,
            email: g.email as string,
            name: (g.name as string | undefined) ?? (g.email as string),
          }));
        return { groups, nextPageToken: res.data.nextPageToken ?? undefined };
      } catch (err) {
        toAuthError(err);
      }
    },
  };
}
