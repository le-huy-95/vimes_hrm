import { describe, expect, it } from "vitest";
import { getReportLink } from "../src/modules/ai/tools/read-tools.js";

describe("get_report_link", () => {
  it("is unavailable", async () => {
    const r = await getReportLink();
    expect(r.data).toEqual({ available: false });
    expect(r.linkCandidates).toEqual([]);
  });
});
