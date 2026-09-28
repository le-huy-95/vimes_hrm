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

describe("ai rate limit", () => {
  it("allows then blocks per minute", () => {
    resetAiRateLimitForTests();
    process.env.AI_RATE_LIMIT_PER_MIN = "2";
    expect(checkAiRateLimit("u1")).toBeNull();
    expect(checkAiRateLimit("u1")).toBeNull();
    expect(checkAiRateLimit("u1")?.code).toBe("RATE_LIMIT");
  });

  it("blocks on daily token budget", () => {
    resetAiRateLimitForTests();
    process.env.AI_TOKEN_BUDGET_PER_DAY = "10";
    addTokenUsage("u2", 11);
    expect(checkAiRateLimit("u2")?.code).toBe("AI_BUDGET");
  });
});
