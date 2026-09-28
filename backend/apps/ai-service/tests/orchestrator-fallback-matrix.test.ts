import { describe, expect, it } from "vitest";
import { AppError } from "@manage-teams/lib";
import { nextStepWithFallback } from "../src/modules/ai/orchestrator.js";
import type { LLMProvider, PlanStep } from "../src/modules/ai/providers/types.js";
import { MockPlanner } from "../src/modules/ai/providers/mock.js";

class OkProvider implements LLMProvider {
  name = "openai" as const;
  async nextStep(): Promise<PlanStep> {
    return { kind: "final", answer: "from-primary" };
  }
}

class FailProvider implements LLMProvider {
  name = "anthropic" as const;
  async nextStep(): Promise<PlanStep> {
    throw new Error("network");
  }
}

describe("nextStepWithFallback — matrix", () => {
  it("returns primary when ok", async () => {
    const r = await nextStepWithFallback(
      new OkProvider(),
      new MockPlanner(),
      { message: "x", toolResults: [] },
      false,
    );
    expect(r.mock).toBe(false);
    expect(r.provider.name).toBe("openai");
    expect(r.step).toEqual({ kind: "final", answer: "from-primary" });
  });

  it("fallback when primary fails and requireLlm=false", async () => {
    const r = await nextStepWithFallback(
      new FailProvider(),
      new MockPlanner(),
      { message: "việc mở", toolResults: [] },
      false,
    );
    expect(r.mock).toBe(true);
    expect(r.provider.name).toBe("mock");
    expect(r.step.kind).toBe("tools");
  });

  it("throws AI_PROVIDER 502 when requireLlm=true and primary fails", async () => {
    await expect(
      nextStepWithFallback(
        new FailProvider(),
        new MockPlanner(),
        { message: "x", toolResults: [] },
        true,
      ),
    ).rejects.toMatchObject({ code: "AI_PROVIDER", statusCode: 502 } satisfies Partial<AppError>);
  });

  it("mock primary reports mock=true", async () => {
    const r = await nextStepWithFallback(
      new MockPlanner(),
      new MockPlanner(),
      { message: "x", toolResults: [] },
      false,
    );
    expect(r.mock).toBe(true);
  });
});
