import type { TaskStatus } from "@prisma/client";

const TASK_REF_RE = /#task-([a-z0-9]+)/i;

export function extractTaskIdFromTitle(title: string): string | null {
  const m = TASK_REF_RE.exec(title);
  return m ? m[1]! : null;
}

export function mapGithubEventToTaskStatus(
  event: string,
  action: string | null,
  payload: Record<string, unknown>,
): TaskStatus | null {
  if (action === "opened" || action === "reopened") return "in_progress";
  if (event === "issues" && action === "closed") return "done";
  if (event === "pull_request" && action === "closed") {
    const pr = payload.pull_request as { merged?: boolean } | undefined;
    return pr?.merged === true ? "done" : null;
  }
  return null;
}
