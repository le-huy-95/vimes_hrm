import { afterEach, describe, expect, it } from "vitest";
import { createProvider, peekProviderChoice } from "../src/modules/ai/providers/factory.js";

const keys = ["AI_PROVIDER", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "AI_OPENAI_MODEL"] as const;

afterEach(() => {
  for (const k of keys) delete process.env[k];
});

describe("peekProviderChoice", () => {
  it("auto → mock when no keys", () => {
    process.env.AI_PROVIDER = "auto";
    expect(peekProviderChoice()).toBe("mock");
  });

  it("auto → openai when only OPENAI_API_KEY", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.AI_OPENAI_MODEL = "gpt-test";
    expect(peekProviderChoice()).toBe("openai");
  });

  it("auto prefers anthropic when both keys", () => {
    process.env.ANTHROPIC_API_KEY = "a";
    process.env.OPENAI_API_KEY = "o";
    process.env.AI_OPENAI_MODEL = "gpt-test";
    expect(peekProviderChoice()).toBe("anthropic");
  });
});

describe("createProvider", () => {
  it("returns mock provider by default", () => {
    expect(createProvider().name).toBe("mock");
  });
});
