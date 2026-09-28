import { afterEach, describe, expect, it } from "vitest";
import {
  addTokenUsage,
  checkAiRateLimit,
  resetAiRateLimitForTests,
} from "../src/modules/ai/rate-limit.js";

afterEach(() => {
  resetAiRateLimitForTests();
  delete process.env.AI_RATE_LIMIT_PER_MIN;
  delete process.env.AI_TOKEN_BUDGET_PER_DAY;
});

describe("rate limit — matrix", () => {
  it("default limit is 10", () => {
    resetAiRateLimitForTests();
    for (let i = 0; i < 10; i++) expect(checkAiRateLimit("u")).toBeNull();
    expect(checkAiRateLimit("u")?.code).toBe("RATE_LIMIT");
  });

  it("users are isolated", () => {
    process.env.AI_RATE_LIMIT_PER_MIN = "1";
    expect(checkAiRateLimit("a")).toBeNull();
    expect(checkAiRateLimit("a")?.code).toBe("RATE_LIMIT");
    expect(checkAiRateLimit("b")).toBeNull();
  });

  it("exact budget boundary: used == budget still allowed for rate path", () => {
    process.env.AI_TOKEN_BUDGET_PER_DAY = "10";
    addTokenUsage("u", 10);
    // used > budget blocks; used == budget does not
    expect(checkAiRateLimit("u")).toBeNull();
  });

  it("used > budget blocks with AI_BUDGET before counting rate", () => {
    process.env.AI_TOKEN_BUDGET_PER_DAY = "5";
    process.env.AI_RATE_LIMIT_PER_MIN = "100";
    addTokenUsage("u", 6);
    expect(checkAiRateLimit("u")?.code).toBe("AI_BUDGET");
    expect(checkAiRateLimit("u")?.statusCode).toBe(429);
  });

  it("addTokenUsage ignores non-positive", () => {
    process.env.AI_TOKEN_BUDGET_PER_DAY = "1";
    addTokenUsage("u", 0);
    addTokenUsage("u", -5);
    expect(checkAiRateLimit("u")).toBeNull();
  });

  it("RATE_LIMIT has 429 status", () => {
    process.env.AI_RATE_LIMIT_PER_MIN = "0";
    // count becomes 1 > 0
    const err = checkAiRateLimit("u");
    expect(err?.code).toBe("RATE_LIMIT");
    expect(err?.statusCode).toBe(429);
  });
});
