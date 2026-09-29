/** Tạo snippet highlight quanh từ khoá (case-insensitive). */
export function buildHighlight(body: string, q: string, radius = 40): string {
  const lower = body.toLowerCase();
  const needle = q.trim().toLowerCase();
  if (!needle) return body.slice(0, radius * 2);
  const idx = lower.indexOf(needle);
  if (idx < 0) {
    // FTS có thể match unaccent — fallback đầu body
    const head = body.slice(0, radius * 2);
    return head.length < body.length ? `${head}…` : head;
  }
  const start = Math.max(0, idx - radius);
  const end = Math.min(body.length, idx + needle.length + radius);
  const snippet = body.slice(start, end);
  return `${start > 0 ? "…" : ""}${snippet}${end < body.length ? "…" : ""}`;
}
