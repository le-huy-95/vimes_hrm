import { describe, expect, it } from "vitest";
import { MockPlanner } from "../src/modules/ai/providers/mock.js";

describe("MockPlanner — intent matrix", () => {
  const p = new MockPlanner();

  it.each([
    ["Việc nào của tôi đang mở?", "list_my_tasks"],
    ["cho mình link công việc", "list_my_tasks"],
    ["my open todos please", "list_my_tasks"],
    ["task sắp hạn", "list_my_tasks"],
    ["hello", "list_my_tasks"], // default
  ])("message %j → %s", async (message, tool) => {
    const step = await p.nextStep({ message, toolResults: [] });
    expect(step.kind).toBe("tools");
    if (step.kind === "tools") expect(step.calls[0]?.name).toBe(tool);
  });

  it.each([
    ["trạng thái đồng bộ google", "sync_status"],
    ["Google sync status", "sync_status"],
    ["kết quả sync của tôi", "sync_status"],
  ])("sync intent %j → sync_status", async (message) => {
    const step = await p.nextStep({ message, toolResults: [] });
    expect(step.kind).toBe("tools");
    if (step.kind === "tools") expect(step.calls[0]?.name).toBe("sync_status");
  });

  it.each(["workload của tôi", "khối lượng công việc", "tóm tắt summary"])(
    "workload intent %j",
    async (message) => {
      const step = await p.nextStep({ message, toolResults: [] });
      expect(step.kind).toBe("tools");
      if (step.kind === "tools") expect(step.calls[0]?.name).toBe("workload_summary");
    },
  );

  it("list_my_tasks uses openOnly true", async () => {
    const step = await p.nextStep({ message: "việc đang mở", toolResults: [] });
    expect(step.kind).toBe("tools");
    if (step.kind === "tools") {
      expect(step.calls[0]?.args).toEqual({ openOnly: true });
    }
  });

  it("final with empty array → no-result message", async () => {
    const step = await p.nextStep({
      message: "x",
      toolResults: [{ name: "list_my_tasks", result: [] }],
    });
    expect(step.kind).toBe("final");
    if (step.kind === "final") expect(step.answer).toContain("Không có kết quả");
  });

  it("final with null result → no-result message", async () => {
    const step = await p.nextStep({
      message: "x",
      toolResults: [{ name: "get_task", result: null }],
    });
    expect(step.kind).toBe("final");
    if (step.kind === "final") expect(step.answer).toContain("Không có kết quả");
  });

  it("final with object result → found message", async () => {
    const step = await p.nextStep({
      message: "x",
      toolResults: [{ name: "sync_status", result: { googleLinked: false } }],
    });
    expect(step.kind).toBe("final");
    if (step.kind === "final") {
      expect(step.answer).toContain("Tìm thấy");
      expect(step.answer).toContain("sync_status");
    }
  });

  it("sync wins over task keywords when both present", async () => {
    const step = await p.nextStep({
      message: "sync google và việc của tôi",
      toolResults: [],
    });
    expect(step.kind).toBe("tools");
    if (step.kind === "tools") expect(step.calls[0]?.name).toBe("sync_status");
  });
});
