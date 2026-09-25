import { describe, expect, it } from "vitest";
import { workspaceUserContentHash } from "./content-hash.js";

const base = {
  primaryEmail: "User@Example.com",
  fullName: "Test User",
  orgUnit: "/eng",
  photoUrl: null as string | null,
  suspended: false,
};

describe("workspaceUserContentHash", () => {
  it("is stable for same fields", () => {
    expect(workspaceUserContentHash(base)).toBe(workspaceUserContentHash({ ...base }));
  });

  it("is case-insensitive on email", () => {
    expect(workspaceUserContentHash(base)).toBe(
      workspaceUserContentHash({ ...base, primaryEmail: "user@example.com" }),
    );
  });

  it("changes when suspended flips", () => {
    expect(workspaceUserContentHash(base)).not.toBe(
      workspaceUserContentHash({ ...base, suspended: true }),
    );
  });
});
