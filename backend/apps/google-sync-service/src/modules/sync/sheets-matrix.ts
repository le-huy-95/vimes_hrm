import { createHash } from "node:crypto";

/** Cột sheet: A=code (khóa), B=title (protected), C=status (writable), D=personal_note (writable), E=assignee */
export const SHEET_HEADERS = ["code", "title", "status", "personal_note", "assignee_user_id"] as const;
export type SheetColumn = (typeof SHEET_HEADERS)[number];

export const DEFAULT_WRITABLE: SheetColumn[] = ["status", "personal_note"];

export type SheetRow = {
  code: string;
  title: string;
  status: string;
  personal_note: string;
  assignee_user_id: string;
};

export function rowHash(row: SheetRow): string {
  return createHash("sha256")
    .update(JSON.stringify([row.code, row.title, row.status, row.personal_note, row.assignee_user_id]))
    .digest("hex")
    .slice(0, 16);
}

export function matrixHash(rows: SheetRow[]): string {
  return createHash("sha256")
    .update(JSON.stringify(rows.map((r) => rowHash(r))))
    .digest("hex");
}

/** Chỉ giữ field writable khi pull từ Sheet → app. */
export function filterWritablePatch(
  incoming: Partial<SheetRow>,
  writable: string[],
): Partial<Pick<SheetRow, "status" | "personal_note">> {
  const out: Partial<Pick<SheetRow, "status" | "personal_note">> = {};
  if (writable.includes("status") && incoming.status != null) out.status = incoming.status;
  if (writable.includes("personal_note") && incoming.personal_note != null) {
    out.personal_note = incoming.personal_note;
  }
  return out;
}

/** Parse hàng values[] theo header. */
export function parseSheetValues(values: string[][]): {
  rows: SheetRow[];
  hashes: Record<string, string>;
} {
  if (values.length === 0) return { rows: [], hashes: {} };
  const header = values[0]!.map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const rows: SheetRow[] = [];
  const hashes: Record<string, string> = {};
  for (const line of values.slice(1)) {
    if (!line[idx("code")]) continue;
    const row: SheetRow = {
      code: String(line[idx("code")] ?? ""),
      title: String(line[idx("title")] ?? ""),
      status: String(line[idx("status")] ?? "TODO"),
      personal_note: String(line[idx("personal_note")] ?? ""),
      assignee_user_id: String(line[idx("assignee_user_id")] ?? ""),
    };
    rows.push(row);
    hashes[`${row.code}:${row.assignee_user_id}`] = rowHash(row);
  }
  return { rows, hashes };
}

export function rowsToValues(rows: SheetRow[]): string[][] {
  return [
    [...SHEET_HEADERS],
    ...rows.map((r) => [r.code, r.title, r.status, r.personal_note, r.assignee_user_id]),
  ];
}
