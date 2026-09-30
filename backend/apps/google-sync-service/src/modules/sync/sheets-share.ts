import { prismaRead } from "@manage-teams/db";
import { createLogger } from "@manage-teams/lib";
import { driveClient, getGoogleOAuthForUser } from "../../infra/google-oauth-client.js";
import { googleLimiter } from "../../infra/google-limiter.js";
import { isRealSpreadsheetId } from "./sheets-live.js";

const logger = createLogger("google-sync-service");

export type GoogleEmailRow = {
  userId: string;
  email: string | null;
  isPrimary: boolean;
};

/** One email per userId: primary linked Google account with non-empty email. */
export function collectShareEmails(rows: GoogleEmailRow[]): string[] {
  const byUser = new Map<string, GoogleEmailRow[]>();
  for (const r of rows) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }
  const out: string[] = [];
  for (const list of byUser.values()) {
    const primary = list.find((x) => x.isPrimary && x.email?.trim());
    const any = list.find((x) => x.email?.trim());
    const email = (primary ?? any)?.email?.trim();
    if (email) out.push(email);
  }
  return out;
}

export function isAlreadySharedError(err: unknown): boolean {
  const e = err as {
    code?: number;
    errors?: Array<{ reason?: string }>;
    message?: string;
  };
  if (e?.errors?.some((x) => x.reason === "alreadyExists")) return true;
  const msg = typeof e?.message === "string" ? e.message : String(err);
  return /alreadyExists|already a permission/i.test(msg);
}

export async function shareSpreadsheetWithGroupMembers(input: {
  ownerUserId: string;
  groupId: string;
  spreadsheetId: string;
}): Promise<{ shared: number; skipped: number }> {
  if (!isRealSpreadsheetId(input.spreadsheetId)) {
    return { shared: 0, skipped: 0 };
  }

  const members = await prismaRead.groupMember.findMany({
    where: { groupId: input.groupId, status: "ACTIVE" },
    select: { userId: true },
  });
  const userIds = members.map((m) => m.userId);
  if (userIds.length === 0) return { shared: 0, skipped: 0 };

  const accounts = await prismaRead.userGoogleAccount.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, email: true, isPrimary: true },
  });
  const emails = collectShareEmails(accounts);
  if (emails.length === 0) return { shared: 0, skipped: userIds.length };

  const ok = await googleLimiter.acquire(input.ownerUserId);
  if (!ok) throw new Error("rate_limit_wait");

  const { oauth2 } = await getGoogleOAuthForUser(input.ownerUserId);
  const drive = driveClient(oauth2);

  let shared = 0;
  let skipped = 0;
  for (const email of emails) {
    try {
      await drive.permissions.create({
        fileId: input.spreadsheetId,
        sendNotificationEmail: false,
        requestBody: {
          type: "user",
          role: "writer",
          emailAddress: email,
        },
      });
      shared += 1;
    } catch (err) {
      if (isAlreadySharedError(err)) {
        shared += 1;
        continue;
      }
      skipped += 1;
      logger.warn(
        { groupId: input.groupId, email, err: String(err) },
        "sheets share permission failed",
      );
    }
  }
  logger.info(
    { groupId: input.groupId, spreadsheetId: input.spreadsheetId, shared, skipped },
    "sheets share done",
  );
  return { shared, skipped };
}
