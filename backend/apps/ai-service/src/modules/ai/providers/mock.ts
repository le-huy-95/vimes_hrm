import type { LLMProvider, PlanStep } from "./types.js";

export class MockPlanner implements LLMProvider {
  name = "mock" as const;

  async nextStep(input: {
    message: string;
    toolResults: Array<{ name: string; result: unknown }>;
  }): Promise<PlanStep> {
    if (input.toolResults.length > 0) {
      const first = input.toolResults[0]?.result;
      const n = Array.isArray(first) ? first.length : first == null ? 0 : 1;
      return {
        kind: "final",
        answer:
          n > 0
            ? `Tìm thấy kết quả trong quyền của bạn (${input.toolResults.map((t) => t.name).join(", ")}).`
            : "Không có kết quả phù hợp trong quyền của bạn.",
      };
    }
    const m = input.message.toLowerCase();
    if (/sync|google|đồng bộ/.test(m)) {
      return { kind: "tools", calls: [{ name: "sync_status", args: {} }] };
    }
    if (/workload|khối lượng|tóm tắt|summary/.test(m)) {
      return { kind: "tools", calls: [{ name: "workload_summary", args: {} }] };
    }
    if (/task|việc|mở|todo|công việc|link|hạn/.test(m)) {
      return { kind: "tools", calls: [{ name: "list_my_tasks", args: { openOnly: true } }] };
    }
    return { kind: "tools", calls: [{ name: "list_my_tasks", args: { openOnly: true } }] };
  }
}
