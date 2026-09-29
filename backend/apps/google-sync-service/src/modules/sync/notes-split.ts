/** Tách vùng notes Google: marker [app:uuid] vs ghi chú cá nhân. */
const APP_MARKER = /\[app:([0-9a-f-]{36})\]/i;

export function extractAppTaskId(notes: string): string | null {
  const m = APP_MARKER.exec(notes);
  return m?.[1]?.toLowerCase() ?? null;
}

/**
 * App zone = dòng marker.
 * Personal / chi tiết = phần trước + sau marker (để Notes Google đọc được nội dung thật).
 */
export function splitGoogleNotes(notes: string): {
  taskId: string | null;
  personal: string;
  hasMarker: boolean;
} {
  const m = APP_MARKER.exec(notes);
  if (!m || m.index == null) {
    return { taskId: null, personal: notes.trim(), hasMarker: false };
  }
  const taskId = m[1]!.toLowerCase();
  const before = notes.slice(0, m.index).trim();
  const after = notes.slice(m.index + m[0].length).replace(/^\s*\n?/, "").trim();
  const personal = [before, after].filter(Boolean).join("\n").trim();
  return { taskId, personal, hasMarker: true };
}

/** Ghép notes khi push: chi tiết trước, marker [app:uuid] cuối (ẩn hơn trên Google Details). */
export function composePushNotes(taskId: string, personalNote?: string | null): string {
  const personal = (personalNote ?? "").trim();
  const marker = `[app:${taskId}]`;
  return personal ? `${personal}\n${marker}` : marker;
}

/**
 * Completion: timestamp mới hơn thắng.
 * Trả true nếu nên áp dụng trạng thái Google (completed).
 */
export function shouldApplyGoogleCompletion(opts: {
  googleCompleted: boolean;
  googleCompletedAt: Date | null;
  localStatus: string;
  localCompletedAt: Date | null;
  localCompletedSource: string | null;
}): boolean {
  if (!opts.googleCompleted) return false;
  if (opts.localStatus === "ACTIVE") return true;
  if (opts.localStatus !== "DONE") return false;
  // Local đã DONE: chỉ ghi đè source nếu Google completedAt mới hơn
  if (!opts.googleCompletedAt || !opts.localCompletedAt) return false;
  return opts.googleCompletedAt.getTime() > opts.localCompletedAt.getTime() + 2000;
}

/** Google uncomplete: chỉ khi local DONE đến từ google và Google rõ ràng needsAction mới hơn. */
export function shouldApplyGoogleUncomplete(opts: {
  googleCompleted: boolean;
  googleUpdatedAt: Date | null;
  localStatus: string;
  localCompletedAt: Date | null;
  localCompletedSource: string | null;
}): boolean {
  if (opts.googleCompleted) return false;
  if (opts.localStatus !== "DONE") return false;
  if (opts.localCompletedSource !== "google") return false;
  if (!opts.googleUpdatedAt || !opts.localCompletedAt) return true;
  return opts.googleUpdatedAt.getTime() > opts.localCompletedAt.getTime();
}
