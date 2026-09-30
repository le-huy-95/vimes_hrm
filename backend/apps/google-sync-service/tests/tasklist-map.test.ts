import { describe, expect, test } from "bun:test";
import { pickUnmappedGroupIds } from "../src/modules/sync/tasklist-map.service.js";

describe("pickUnmappedGroupIds", () => {
  test("returns membership groups without a map", () => {
    const membershipGroupIds = ["g1", "g2", "g3"];
    const mappedGroupIds = ["g2"];
    expect(pickUnmappedGroupIds(membershipGroupIds, mappedGroupIds).sort()).toEqual([
      "g1",
      "g3",
    ]);
  });

  test("returns empty when all mapped", () => {
    expect(pickUnmappedGroupIds(["g1"], ["g1"])).toEqual([]);
  });
});
