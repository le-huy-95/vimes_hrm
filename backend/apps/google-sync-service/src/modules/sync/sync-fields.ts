/** Payload chuẩn TASKS_PUSH. */
export type TaskPushPayload = {
  title: string;
  notes: string;
  status: string;
  /** YYYY-MM-DD hoặc null để xóa hạn trên Google. */
  due?: string | null;
};

/** Parse contentHash JSON đã lưu trên google_task_links. */
export function parseStoredPayload(raw: string | null | undefined): Partial<TaskPushPayload> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<TaskPushPayload>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Chỉ giữ field đổi so với bản đã sync (partial PATCH).
 * Trả null nếu không có gì đổi.
 */
export function diffPushFields(
  next: TaskPushPayload,
  prev: Partial<TaskPushPayload>,
): Partial<TaskPushPayload> | null {
  const out: Partial<TaskPushPayload> = {};
  if (next.title !== prev.title) out.title = next.title;
  if (next.notes !== (prev.notes ?? "")) out.notes = next.notes;
  if (next.status !== (prev.status ?? "TODO")) out.status = next.status;
  const nextDue = next.due ?? null;
  const prevDue = prev.due ?? null;
  if (nextDue !== prevDue) out.due = nextDue;
  return Object.keys(out).length > 0 ? out : null;
}

/** field_hashes theo trường để chống echo / merge. */
export function buildFieldHashes(fields: {
  title?: string;
  notes?: string;
  status?: string;
  due?: string | null;
}): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v == null) continue;
    hashes[k] = simpleHash(String(v));
  }
  return hashes;
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

/** Local thắng nếu updatedAt local mới hơn Google updated (cộng slack). */
export function localWinsConflict(
  localUpdatedAt: Date,
  googleUpdatedIso: string | null | undefined,
  slackMs = 2000,
): boolean {
  if (!googleUpdatedIso) return true;
  const g = Date.parse(googleUpdatedIso);
  if (Number.isNaN(g)) return true;
  return localUpdatedAt.getTime() + slackMs >= g;
}

/** Google Tasks due: date-only midnight UTC. */
export function dueToGoogleRfc3339(due: string | null | undefined): string | null | undefined {
  if (due === null) return null;
  if (due == null || due === "") return undefined;
  return `${due}T00:00:00.000Z`;
}

export function googleDueToDateOnly(due: string | null | undefined): string | null {
  if (!due) return null;
  return due.slice(0, 10);
}

export function formatDbDue(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}
