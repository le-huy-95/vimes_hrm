import { describe, expect, it } from "vitest";
import {
  buildFieldHashes,
  diffPushFields,
  localWinsConflict,
  parseStoredPayload,
  dueToGoogleRfc3339,
  googleDueToDateOnly,
} from "../src/modules/sync/sync-fields.js";

describe("diffPushFields", () => {
  it("returns null when unchanged", () => {
    const next = { title: "a", notes: "n", status: "TODO" };
    expect(diffPushFields(next, next)).toBeNull();
  });

  it("returns only changed fields", () => {
    const diff = diffPushFields(
      { title: "b", notes: "n", status: "DONE" },
      { title: "a", notes: "n", status: "TODO" },
    );
    expect(diff).toEqual({ title: "b", status: "DONE" });
  });

  it("includes due when changed", () => {
    const diff = diffPushFields(
      { title: "a", notes: "n", status: "TODO", due: "2026-09-30" },
      { title: "a", notes: "n", status: "TODO" },
    );
    expect(diff).toEqual({ due: "2026-09-30" });
  });

  it("detects due clear to null", () => {
    const diff = diffPushFields(
      { title: "a", notes: "n", status: "TODO", due: null },
      { title: "a", notes: "n", status: "TODO", due: "2026-09-30" },
    );
    expect(diff).toEqual({ due: null });
  });
});

describe("parseStoredPayload", () => {
  it("parses json", () => {
    expect(parseStoredPayload('{"title":"x"}')).toEqual({ title: "x" });
  });
  it("handles garbage", () => {
    expect(parseStoredPayload("not-json")).toEqual({});
  });
});

describe("buildFieldHashes", () => {
  it("hashes known fields", () => {
    const h = buildFieldHashes({ title: "t", status: "DONE" });
    expect(h.title).toBeTruthy();
    expect(h.status).toBeTruthy();
    expect(h.notes).toBeUndefined();
  });
});

describe("localWinsConflict", () => {
  it("local wins when newer", () => {
    const local = new Date("2026-09-28T12:00:05Z");
    expect(localWinsConflict(local, "2026-09-28T12:00:00Z")).toBe(true);
  });
  it("google wins when clearly newer", () => {
    const local = new Date("2026-09-28T12:00:00Z");
    expect(localWinsConflict(local, "2026-09-28T12:01:00Z")).toBe(false);
  });
});

describe("due helpers", () => {
  it("maps date-only to RFC3339 and back", () => {
    expect(dueToGoogleRfc3339("2026-09-30")).toBe("2026-09-30T00:00:00.000Z");
    expect(dueToGoogleRfc3339(null)).toBeNull();
    expect(googleDueToDateOnly("2026-09-30T00:00:00.000Z")).toBe("2026-09-30");
    expect(googleDueToDateOnly(undefined)).toBeNull();
  });
});
