/**
 * OpenTelemetry “lite” — span timing + counters, không phụ thuộc OTel SDK.
 * Có thể gắn Prometheus / exporter thật sau (Phase 6+).
 */

export type SpanHandle = {
  name: string;
  startMs: number;
  attrs: Record<string, string>;
};

type OtelState = {
  spansStarted: number;
  spansOk: number;
  spansErr: number;
  totalDurationMs: number;
  byName: Map<string, { count: number; durationMs: number; errors: number }>;
};

const state: OtelState = {
  spansStarted: 0,
  spansOk: 0,
  spansErr: 0,
  totalDurationMs: 0,
  byName: new Map(),
};

export function startSpan(name: string, attrs: Record<string, string> = {}): SpanHandle {
  state.spansStarted += 1;
  return { name, startMs: Date.now(), attrs };
}

export function endSpan(handle: SpanHandle, ok = true): number {
  const durationMs = Date.now() - handle.startMs;
  state.totalDurationMs += durationMs;
  if (ok) state.spansOk += 1;
  else state.spansErr += 1;

  const prev = state.byName.get(handle.name) ?? { count: 0, durationMs: 0, errors: 0 };
  prev.count += 1;
  prev.durationMs += durationMs;
  if (!ok) prev.errors += 1;
  state.byName.set(handle.name, prev);
  return durationMs;
}

/** Chạy fn trong span; lỗi → endSpan(false) rồi rethrow. */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attrs: Record<string, string> = {},
): Promise<T> {
  const span = startSpan(name, attrs);
  try {
    const result = await fn();
    endSpan(span, true);
    return result;
  } catch (err) {
    endSpan(span, false);
    throw err;
  }
}

export function getOtelSnapshot() {
  const byName: Record<string, { count: number; durationMs: number; errors: number }> = {};
  for (const [k, v] of state.byName) byName[k] = { ...v };
  return {
    spansStarted: state.spansStarted,
    spansOk: state.spansOk,
    spansErr: state.spansErr,
    totalDurationMs: state.totalDurationMs,
    byName,
  };
}

/** Dòng Prometheus bổ sung (gắn vào /metrics). */
export function otelPrometheusLines(): string[] {
  const s = getOtelSnapshot();
  const lines = [
    "# HELP otel_lite_spans_started_total Spans started (lite)",
    "# TYPE otel_lite_spans_started_total counter",
    `otel_lite_spans_started_total ${s.spansStarted}`,
    "# HELP otel_lite_spans_ok_total Spans completed OK",
    "# TYPE otel_lite_spans_ok_total counter",
    `otel_lite_spans_ok_total ${s.spansOk}`,
    "# HELP otel_lite_spans_err_total Spans completed with error",
    "# TYPE otel_lite_spans_err_total counter",
    `otel_lite_spans_err_total ${s.spansErr}`,
    "# HELP otel_lite_span_duration_ms_total Cumulative span duration",
    "# TYPE otel_lite_span_duration_ms_total counter",
    `otel_lite_span_duration_ms_total ${s.totalDurationMs}`,
  ];
  for (const [name, v] of Object.entries(s.byName)) {
    const safe = name.replace(/[^a-zA-Z0-9_]/g, "_");
    lines.push(
      `otel_lite_span_by_name_total{name="${safe}"} ${v.count}`,
      `otel_lite_span_by_name_duration_ms_total{name="${safe}"} ${v.durationMs}`,
      `otel_lite_span_by_name_errors_total{name="${safe}"} ${v.errors}`,
    );
  }
  return lines;
}

/** Reset (test). */
export function resetOtelLite(): void {
  state.spansStarted = 0;
  state.spansOk = 0;
  state.spansErr = 0;
  state.totalDurationMs = 0;
  state.byName.clear();
}
