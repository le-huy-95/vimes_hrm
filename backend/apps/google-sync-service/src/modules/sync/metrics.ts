import { otelPrometheusLines } from "@manage-teams/lib";

/**
 * Đếm lời gọi Google + 429 — Phase 5 observability.
 */
type Counters = {
  googleCalls: number;
  google429: number;
  sheetsPush: number;
  sheetsPull: number;
  tasksPush: number;
  tasksPull: number;
  startedAt: number;
};

const c: Counters = {
  googleCalls: 0,
  google429: 0,
  sheetsPush: 0,
  sheetsPull: 0,
  tasksPush: 0,
  tasksPull: 0,
  startedAt: Date.now(),
};

export function trackGoogleCall(ok: boolean, kind?: string): void {
  c.googleCalls += 1;
  if (!ok) c.google429 += 1;
  if (kind === "SHEETS_PUSH") c.sheetsPush += 1;
  if (kind === "SHEETS_PULL") c.sheetsPull += 1;
  if (kind === "TASKS_PUSH") c.tasksPush += 1;
  if (kind === "TASKS_PULL") c.tasksPull += 1;
}

export function getGoogleMetrics(): Counters & { upSeconds: number; quotaAlert: boolean } {
  const upSeconds = Math.floor((Date.now() - c.startedAt) / 1000);
  const rate = c.googleCalls > 0 ? c.google429 / c.googleCalls : 0;
  return {
    ...c,
    upSeconds,
    /** Cảnh báo khi tỷ lệ 429 > 20% hoặc gọi quá ngưỡng/phút (ước lượng). */
    quotaAlert: rate >= 0.2 || c.google429 >= 10,
  };
}

export function metricsPrometheus(extra: Record<string, number> = {}): string {
  const m = getGoogleMetrics();
  const lines = [
    "# HELP google_sync_up 1 if up",
    "# TYPE google_sync_up gauge",
    "google_sync_up 1",
    `# HELP google_sync_up_seconds Process uptime`,
    `# TYPE google_sync_up_seconds gauge`,
    `google_sync_up_seconds ${m.upSeconds}`,
    "# HELP google_api_calls_total Google API calls",
    "# TYPE google_api_calls_total counter",
    `google_api_calls_total ${m.googleCalls}`,
    "# HELP google_api_429_total Google 429 responses",
    "# TYPE google_api_429_total counter",
    `google_api_429_total ${m.google429}`,
    "# HELP google_sync_quota_alert 1 if quota pressure",
    "# TYPE google_sync_quota_alert gauge",
    `google_sync_quota_alert ${m.quotaAlert ? 1 : 0}`,
    `# HELP google_sheets_push_total Sheets push attempts`,
    `# TYPE google_sheets_push_total counter`,
    `google_sheets_push_total ${m.sheetsPush}`,
    `# HELP google_sheets_pull_total Sheets pull attempts`,
    `# TYPE google_sheets_pull_total counter`,
    `google_sheets_pull_total ${m.sheetsPull}`,
  ];
  for (const [k, v] of Object.entries(extra)) {
    lines.push(`# TYPE ${k} gauge`, `${k} ${v}`);
  }
  lines.push(...otelPrometheusLines());
  return lines.join("\n") + "\n";
}
