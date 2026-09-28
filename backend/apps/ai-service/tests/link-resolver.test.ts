import { describe, expect, it, vi } from "vitest";
import { buildEntityHref, resolveLinks } from "../src/modules/ai/link-resolver.js";

describe("buildEntityHref", () => {
  it("builds task href", () => {
    expect(
      buildEntityHref("http://localhost:3000", {
        type: "task",
        id: "t1",
        groupId: "g1",
        code: "T-1",
      }),
    ).toBe("http://localhost:3000/groups/g1/tasks/T-1");
  });

  it("builds group href", () => {
    expect(buildEntityHref("http://app", { type: "group", id: "g1" })).toBe("http://app/groups/g1");
  });
});

describe("resolveLinks", () => {
  it("keeps allowed task, drops denied", async () => {
    const check = vi.fn(async (c: { type: string; id: string }) => c.id === "ok");
    const links = await resolveLinks(
      "http://app",
      [
        { type: "task", id: "ok", groupId: "g", code: "T-1", label: "A" },
        { type: "task", id: "no", groupId: "g", code: "T-2", label: "B" },
      ],
      check,
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.id).toBe("ok");
    expect(links[0]?.href).toContain("/tasks/T-1");
  });
});
