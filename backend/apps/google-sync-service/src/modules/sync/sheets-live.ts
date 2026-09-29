import { googleLimiter } from "../../infra/google-limiter.js";
import {
  driveClient,
  getGoogleOAuthForUser,
  sheetsClient,
} from "../../infra/google-oauth-client.js";
import { SHEET_HEADERS, type SheetRow, rowsToValues } from "./sheets-matrix.js";

const DATA_RANGE = "Sheet1!A:E";
const WRITE_RANGE = "Sheet1!A1";

/** Id local matrix (dev) — không dùng làm spreadsheetId Google. */
export function isRealSpreadsheetId(id: string | null | undefined): id is string {
  return Boolean(id && !id.startsWith("local-"));
}

/** Tạo spreadsheet mới (owner OAuth) hoặc trả id hiện có. */
export async function ensureLiveSpreadsheet(input: {
  userId: string;
  groupId: string;
  spreadsheetId: string | null;
  title?: string;
}): Promise<{ spreadsheetId: string; created: boolean }> {
  const ok = await googleLimiter.acquire(input.userId);
  if (!ok) throw new Error("rate_limit_wait");

  if (isRealSpreadsheetId(input.spreadsheetId)) {
    return { spreadsheetId: input.spreadsheetId, created: false };
  }

  const { oauth2 } = await getGoogleOAuthForUser(input.userId);
  const sheets = sheetsClient(oauth2);
  const title = input.title ?? `Manage Teams — ${input.groupId.slice(0, 8)}`;
  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: "Sheet1" } }],
    },
  });
  const spreadsheetId = created.data.spreadsheetId;
  if (!spreadsheetId) throw new Error("Sheets create: thiếu spreadsheetId");

  // Protected: cột A (code) + B (title) — chỉ owner sửa; C/D writable
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties.sheetId",
    });
    const sheetId = meta.data.sheets?.[0]?.properties?.sheetId ?? 0;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addProtectedRange: {
              protectedRange: {
                range: {
                  sheetId,
                  startRowIndex: 0,
                  startColumnIndex: 0,
                  endColumnIndex: 2, // A–B
                },
                description: "Manage Teams: code + title (protected)",
                warningOnly: false,
              },
            },
          },
        ],
      },
    });
  } catch {
    // Không chặn push nếu protect thất bại (shared sheet / quyền hạn)
  }

  return { spreadsheetId, created: true };
}

/** Ghi toàn bộ matrix (header + rows) lên Sheet. */
export async function livePushMatrix(input: {
  userId: string;
  spreadsheetId: string;
  rows: SheetRow[];
}): Promise<void> {
  const ok = await googleLimiter.acquire(input.userId);
  if (!ok) throw new Error("rate_limit_wait");

  const { oauth2 } = await getGoogleOAuthForUser(input.userId);
  const sheets = sheetsClient(oauth2);
  const values = rowsToValues(input.rows);
  await sheets.spreadsheets.values.update({
    spreadsheetId: input.spreadsheetId,
    range: WRITE_RANGE,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

/** Đọc A:E từ spreadsheet (LIVE pull). */
export async function livePullValues(input: {
  userId: string;
  spreadsheetId: string;
}): Promise<string[][]> {
  const ok = await googleLimiter.acquire(input.userId);
  if (!ok) throw new Error("rate_limit_wait");

  const { oauth2 } = await getGoogleOAuthForUser(input.userId);
  const sheets = sheetsClient(oauth2);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: input.spreadsheetId,
    range: DATA_RANGE,
  });
  const values = (res.data.values ?? []) as string[][];
  if (values.length === 0) {
    return [[...SHEET_HEADERS]];
  }
  return values;
}

/** Đăng ký Drive files.watch → webhook HTTPS công khai. */
export async function liveRegisterDriveWatch(input: {
  userId: string;
  fileId: string;
  channelId: string;
  token: string;
  expiresAt: Date;
  address: string;
}): Promise<{ resourceId?: string | null }> {
  const ok = await googleLimiter.acquire(input.userId);
  if (!ok) throw new Error("rate_limit_wait");

  const { oauth2 } = await getGoogleOAuthForUser(input.userId);
  const drive = driveClient(oauth2);
  const res = await drive.files.watch({
    fileId: input.fileId,
    requestBody: {
      id: input.channelId,
      type: "web_hook",
      address: input.address,
      token: input.token,
      expiration: String(input.expiresAt.getTime()),
    },
  });
  return { resourceId: res.data.resourceId ?? null };
}
