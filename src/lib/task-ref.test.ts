import { describe, expect, it } from "vitest";
import { extractTaskIdFromTitle, mapGithubEventToTaskStatus } from "./task-ref.js";

describe("extractTaskIdFromTitle", () => {
  it("extracts first match", () => {
    expect(extractTaskIdFromTitle("Fix bug #task-abc123 now")).toBe("abc123");
  });
  it("is case-insensitive", () => {
    expect(extractTaskIdFromTitle("Fix #TASK-XYZ9")).toBe("XYZ9");
  });
  it("returns first of multiple", () => {
    expect(extractTaskIdFromTitle("#task-aaa then #task-bbb")).toBe("aaa");
  });
  it("returns null when absent", () => {
    expect(extractTaskIdFromTitle("no ref here")).toBeNull();
  });
});

describe("mapGithubEventToTaskStatus", () => {
  it("opened/reopened -> in_progress", () => {
    expect(mapGithubEventToTaskStatus("issues", "opened", {})).toBe("in_progress");
    expect(mapGithubEventToTaskStatus("pull_request", "reopened", {})).toBe("in_progress");
  });
  it("issues closed -> done", () => {
    expect(mapGithubEventToTaskStatus("issues", "closed", {})).toBe("done");
  });
  it("merged PR closed -> done", () => {
    expect(
      mapGithubEventToTaskStatus("pull_request", "closed", { pull_request: { merged: true } }),
    ).toBe("done");
  });
  it("unmerged PR closed -> null", () => {
    expect(
      mapGithubEventToTaskStatus("pull_request", "closed", { pull_request: { merged: false } }),
    ).toBeNull();
  });
  it("other actions -> null", () => {
    expect(mapGithubEventToTaskStatus("issues", "edited", {})).toBeNull();
  });
});
