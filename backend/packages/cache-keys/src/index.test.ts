import { describe, expect, it } from "vitest";
import { CACHE_PREFIX, groupMembershipKey, presenceKey, RT_PREFIX } from "./index.js";

describe("cache-keys", () => {
  it("uses cache: and rt: prefixes", () => {
    expect(groupMembershipKey("g1").startsWith(CACHE_PREFIX)).toBe(true);
    expect(presenceKey("u1").startsWith(RT_PREFIX)).toBe(true);
  });
});
