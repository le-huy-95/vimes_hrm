import { describe, expect, it } from "vitest";
import { planStatusMove } from "../src/modules/task/status-move.js";

describe("planStatusMove", () => {
  it("returns noop when status unchanged", () => {
    expect(planStatusMove("TODO", "TODO")).toEqual({ kind: "noop" });
    expect(planStatusMove("DONE", "DONE")).toEqual({ kind: "noop" });
  });

  it("moving to IN_PROGRESS ensures active assignee", () => {
    expect(planStatusMove("TODO", "IN_PROGRESS")).toEqual({
      kind: "move",
      toStatus: "IN_PROGRESS",
      ensureActiveAssignee: true,
      completeAssignee: false,
      reopenAssigneeIfDone: false,
    });
    expect(planStatusMove("DONE", "IN_PROGRESS")).toEqual({
      kind: "move",
      toStatus: "IN_PROGRESS",
      ensureActiveAssignee: true,
      completeAssignee: false,
      reopenAssigneeIfDone: false,
    });
  });

  it("moving to DONE ensures assignee then completes", () => {
    expect(planStatusMove("TODO", "DONE")).toEqual({
      kind: "move",
      toStatus: "DONE",
      ensureActiveAssignee: true,
      completeAssignee: true,
      reopenAssigneeIfDone: false,
    });
    expect(planStatusMove("IN_PROGRESS", "DONE")).toEqual({
      kind: "move",
      toStatus: "DONE",
      ensureActiveAssignee: true,
      completeAssignee: true,
      reopenAssigneeIfDone: false,
    });
  });

  it("moving to TODO reopens done assignee without inventing claim", () => {
    expect(planStatusMove("DONE", "TODO")).toEqual({
      kind: "move",
      toStatus: "TODO",
      ensureActiveAssignee: false,
      completeAssignee: false,
      reopenAssigneeIfDone: true,
    });
    expect(planStatusMove("IN_PROGRESS", "TODO")).toEqual({
      kind: "move",
      toStatus: "TODO",
      ensureActiveAssignee: false,
      completeAssignee: false,
      reopenAssigneeIfDone: true,
    });
  });
});
