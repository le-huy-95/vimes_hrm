import { describe, expect, it } from "vitest";
import { buildDmPairKey } from "../src/modules/conversation/dm-pair.js";

describe("buildDmPairKey", () => {
  const a = "11111111-1111-1111-1111-111111111111";
  const b = "22222222-2222-2222-2222-222222222222";

  it("is order-independent", () => {
    expect(buildDmPairKey(a, b)).toBe(buildDmPairKey(b, a));
  });

  it("sorts lexicographically with colon", () => {
    expect(buildDmPairKey(a, b)).toBe(`${a}:${b}`);
  });

  it("rejects equal ids", () => {
    expect(() => buildDmPairKey(a, a)).toThrow(/same/i);
  });
});
