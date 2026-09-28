import type { ReadToolName, ToolContext, ToolResult } from "./types.js";
import * as tools from "./read-tools.js";

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  switch (name as ReadToolName) {
    case "list_my_tasks":
      return tools.listMyTasks(ctx, args as { openOnly?: boolean });
    case "search_tasks":
      return tools.searchTasks(ctx, args as { q?: string; status?: string });
    case "get_task":
      return tools.getTask(ctx, args as { taskId?: string; code?: string; groupId?: string });
    case "get_group":
      return tools.getGroup(ctx, args as { groupId: string });
    case "list_members":
      return tools.listMembers(ctx, args as { groupId: string });
    case "workload_summary":
      return tools.workloadSummary(ctx);
    case "get_report_link":
      return tools.getReportLink();
    case "sync_status":
      return tools.syncStatus(ctx);
    default:
      return { data: { error: `unknown_tool:${name}` }, linkCandidates: [] };
  }
}

export function toolDefinitionsForLlm(): Array<{
  name: ReadToolName;
  description: string;
  parameters: Record<string, unknown>;
}> {
  return [
    {
      name: "list_my_tasks",
      description: "List the user open tasks",
      parameters: { type: "object", properties: { openOnly: { type: "boolean" } } },
    },
    {
      name: "search_tasks",
      description: "Search tasks by keyword/status",
      parameters: {
        type: "object",
        properties: { q: { type: "string" }, status: { type: "string" } },
      },
    },
    {
      name: "get_task",
      description: "Get one task by id or groupId+code",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          groupId: { type: "string" },
          code: { type: "string" },
        },
      },
    },
    {
      name: "get_group",
      description: "Get group metadata",
      parameters: {
        type: "object",
        properties: { groupId: { type: "string" } },
        required: ["groupId"],
      },
    },
    {
      name: "list_members",
      description: "List active group members",
      parameters: {
        type: "object",
        properties: { groupId: { type: "string" } },
        required: ["groupId"],
      },
    },
    {
      name: "workload_summary",
      description: "Counts of open tasks by status",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "get_report_link",
      description: "Report links if available",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "sync_status",
      description: "Google sync status for user",
      parameters: { type: "object", properties: {} },
    },
  ];
}
