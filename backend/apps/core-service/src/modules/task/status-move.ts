export type TaskBoardStatus = "TODO" | "IN_PROGRESS" | "DONE";

export type StatusMovePlan =
  | { kind: "noop" }
  | {
      kind: "move";
      toStatus: TaskBoardStatus;
      ensureActiveAssignee: boolean;
      completeAssignee: boolean;
      reopenAssigneeIfDone: boolean;
    };

const STATUSES = new Set<string>(["TODO", "IN_PROGRESS", "DONE"]);

export function isTaskBoardStatus(value: string): value is TaskBoardStatus {
  return STATUSES.has(value);
}

export function planStatusMove(
  from: TaskBoardStatus,
  to: TaskBoardStatus,
): StatusMovePlan {
  if (from === to) return { kind: "noop" };

  if (to === "IN_PROGRESS") {
    return {
      kind: "move",
      toStatus: "IN_PROGRESS",
      ensureActiveAssignee: true,
      completeAssignee: false,
      reopenAssigneeIfDone: false,
    };
  }

  if (to === "DONE") {
    return {
      kind: "move",
      toStatus: "DONE",
      ensureActiveAssignee: true,
      completeAssignee: true,
      reopenAssigneeIfDone: false,
    };
  }

  return {
    kind: "move",
    toStatus: "TODO",
    ensureActiveAssignee: false,
    completeAssignee: false,
    reopenAssigneeIfDone: true,
  };
}
