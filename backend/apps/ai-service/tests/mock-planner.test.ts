import { describe, expect, it } from "vitest";
import { MockPlanner } from "../src/modules/ai/providers/mock.js";

describe("MockPlanner", () => {
  const p = new MockPlanner();

  it("plans list_my_tasks for open-work question", async () => {
    const step = await p.nextStep({ message: "Việc nào của tôi đang mở? Cho link", toolResults: [] });
    expect(step.kind).toBe("tools");
    if (step.kind === "tools") {
      expect(step.calls.map((c) => c.name)).toContain("list_my_tasks");
    }
  });

  it("finalizes after tool results", async () => {
    const step = await p.nextStep({
      message: "Việc đang mở",
      toolResults: [{ name: "list_my_tasks", result: [{ code: "T-1" }] }],
    });
    expect(step.kind).toBe("final");
  });

  it("plans sync_status for google sync ask", async () => {
    const step = await p.nextStep({ message: "trạng thái đồng bộ google", toolResults: [] });
    expect(step.kind).toBe("tools");
    if (step.kind === "tools") expect(step.calls[0]?.name).toBe("sync_status");
  });
});
