import { describe, expect, it } from "vitest";
import { nextStepWithFallback } from "../src/modules/ai/orchestrator.js";
import type { LLMProvider, PlanStep } from "../src/modules/ai/providers/types.js";
import { MockPlanner } from "../src/modules/ai/providers/mock.js";

class FailingProvider implements LLMProvider {
  name = "anthropic" as const;
  async nextStep(): Promise<PlanStep> {
    throw new Error("boom");
  }
}

describe("nextStepWithFallback", () => {
  it("uses fallback when primary throws", async () => {
    const primary = new FailingProvider();
    const fallback = new MockPlanner();
    const r = await nextStepWithFallback(
      primary,
      fallback,
      { message: "Việc đang mở", toolResults: [] },
      false,
    );
    expect(r.mock).toBe(true);
    expect(r.provider.name).toBe("mock");
    expect(r.step.kind).toBe("tools");
  });
});
