import { describe, expect, it, vi } from "vitest";
import { buildEntityHref, resolveLinks, type LinkCandidate } from "../src/modules/ai/link-resolver.js";

describe("buildEntityHref — matrix", () => {
  it("strips trailing slash on base", () => {
    expect(
      buildEntityHref("http://app/", { type: "group", id: "g1" }),
    ).toBe("http://app/groups/g1");
  });

  it("builds conversation href", () => {
    expect(
      buildEntityHref("http://app", { type: "conversation", id: "c1" }),
    ).toBe("http://app/conversations/c1");
  });

  it("returns null for task missing groupId", () => {
    expect(buildEntityHref("http://app", { type: "task", id: "t1", code: "T-1" })).toBeNull();
  });

  it("returns null for task missing code", () => {
    expect(buildEntityHref("http://app", { type: "task", id: "t1", groupId: "g1" })).toBeNull();
  });

  it("returns null for unknown type", () => {
    expect(buildEntityHref("http://app", { type: "report", id: "r1" })).toBeNull();
  });

  it("returns null for empty type", () => {
    expect(buildEntityHref("http://app", { type: "", id: "x" })).toBeNull();
  });
});

describe("resolveLinks — permission & href matrix", () => {
  it("drops when access denied even if href valid", async () => {
    const links = await resolveLinks(
      "http://app",
      [{ type: "group", id: "g1", label: "G" }],
      async () => false,
    );
    expect(links).toEqual([]);
  });

  it("drops when access ok but href cannot be built", async () => {
    const links = await resolveLinks(
      "http://app",
      [{ type: "task", id: "t1", label: "bad" }],
      async () => true,
    );
    expect(links).toEqual([]);
  });

  it("preserves order of allowed candidates", async () => {
    const allowed = new Set(["a", "c"]);
    const links = await resolveLinks(
      "http://app",
      [
        { type: "group", id: "a", label: "A" },
        { type: "group", id: "b", label: "B" },
        { type: "group", id: "c", label: "C" },
      ],
      async (c) => allowed.has(c.id),
    );
    expect(links.map((l) => l.id)).toEqual(["a", "c"]);
  });

  it("calls access check once per candidate", async () => {
    const check = vi.fn(async () => true);
    const candidates: LinkCandidate[] = [
      { type: "group", id: "1", label: "1" },
      { type: "group", id: "2", label: "2" },
    ];
    await resolveLinks("http://app", candidates, check);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("empty candidates → empty links", async () => {
    expect(await resolveLinks("http://app", [], async () => true)).toEqual([]);
  });

  it("mixed types: keep only resolvable + allowed", async () => {
    const links = await resolveLinks(
      "https://app.example",
      [
        { type: "task", id: "t1", groupId: "g", code: "T-1", label: "ok task" },
        { type: "task", id: "t2", label: "no code" },
        { type: "group", id: "g1", label: "ok group" },
        { type: "conversation", id: "c1", label: "ok conv" },
        { type: "file", id: "f1", label: "unsupported" },
      ],
      async (c) => c.id !== "g1",
    );
    expect(links).toEqual([
      {
        type: "task",
        id: "t1",
        href: "https://app.example/groups/g/tasks/T-1",
        label: "ok task",
      },
      {
        type: "conversation",
        id: "c1",
        href: "https://app.example/conversations/c1",
        label: "ok conv",
      },
    ]);
  });
});
