import { describe, expect, it } from "vitest";
import { isCorsOriginAllowed, parseCorsOrigins } from "../src/cors.js";

describe("parseCorsOrigins", () => {
  it("splits and trims", () => {
    expect(parseCorsOrigins(" http://a ,http://b ")).toEqual(["http://a", "http://b"]);
  });

  it("uses defaults when unset", () => {
    expect(parseCorsOrigins(undefined)).toContain("http://localhost:8080");
  });
});

describe("isCorsOriginAllowed", () => {
  const list = ["http://localhost:3000", "http://localhost:8080"];

  it("allows missing origin", () => {
    expect(isCorsOriginAllowed(undefined, list, { nodeEnv: "production" })).toBe(true);
  });

  it("allows exact allowlist match in production", () => {
    expect(isCorsOriginAllowed("http://localhost:8080", list, { nodeEnv: "production" })).toBe(
      true,
    );
  });

  it("blocks unknown origin in production", () => {
    expect(isCorsOriginAllowed("http://localhost:55233", list, { nodeEnv: "production" })).toBe(
      false,
    );
  });

  it("allows localhost any port in development", () => {
    expect(isCorsOriginAllowed("http://localhost:55233", list, { nodeEnv: "development" })).toBe(
      true,
    );
    expect(isCorsOriginAllowed("http://127.0.0.1:9999", list, { nodeEnv: "development" })).toBe(
      true,
    );
  });

  it("allows * in allowlist", () => {
    expect(isCorsOriginAllowed("https://evil.example", ["*"], { nodeEnv: "production" })).toBe(
      true,
    );
  });
});
