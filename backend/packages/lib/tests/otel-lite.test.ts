import { describe, expect, it, beforeEach } from "vitest";
import {
  endSpan,
  getOtelSnapshot,
  resetOtelLite,
  startSpan,
  withSpan,
  otelPrometheusLines,
} from "../src/otel-lite.js";

describe("otel-lite", () => {
  beforeEach(() => resetOtelLite());

  it("records ok span", async () => {
    const s = startSpan("demo");
    await new Promise((r) => setTimeout(r, 5));
    const ms = endSpan(s, true);
    expect(ms).toBeGreaterThanOrEqual(0);
    const snap = getOtelSnapshot();
    expect(snap.spansStarted).toBe(1);
    expect(snap.spansOk).toBe(1);
    expect(snap.spansErr).toBe(0);
  });

  it("withSpan marks error", async () => {
    await expect(
      withSpan("boom", async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow("x");
    expect(getOtelSnapshot().spansErr).toBe(1);
  });

  it("prometheus lines include counters", () => {
    const s = startSpan("x");
    endSpan(s, true);
    const text = otelPrometheusLines().join("\n");
    expect(text).toContain("otel_lite_spans_started_total 1");
  });
});
