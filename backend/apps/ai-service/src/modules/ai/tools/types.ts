import type { LinkCandidate } from "../link-resolver.js";

export const READ_TOOLS = [
  "list_my_tasks",
  "search_tasks",
  "get_task",
  "get_group",
  "list_members",
  "workload_summary",
  "get_report_link",
  "sync_status",
] as const;

export type ReadToolName = (typeof READ_TOOLS)[number];

export type ToolContext = { userId: string };

export type ToolResult = {
  data: unknown;
  linkCandidates: LinkCandidate[];
};
