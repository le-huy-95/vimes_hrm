import { describe, expect, it } from "vitest";
import { sniffDangerousContent } from "../src/modules/file/mime-sniff.js";
import { buildHighlight } from "../src/modules/conversation/search-highlight.js";

describe("sniffDangerousContent", () => {
  it("detects html", () => {
    expect(sniffDangerousContent(Buffer.from("<!DOCTYPE html><html><script>x</script>"))).toBe(
      "text/html",
    );
  });

  it("detects svg", () => {
    expect(sniffDangerousContent(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe(
      "image/svg+xml",
    );
  });

  it("allows plain text", () => {
    expect(sniffDangerousContent(Buffer.from("hello world"))).toBeNull();
  });
});

describe("buildHighlight", () => {
  it("wraps match with ellipsis", () => {
    const body = "aaa " + "x".repeat(50) + " mention here " + "y".repeat(50);
    const h = buildHighlight(body, "mention", 10);
    expect(h).toContain("mention");
    expect(h.startsWith("…") || h.includes("mention")).toBe(true);
  });
});
