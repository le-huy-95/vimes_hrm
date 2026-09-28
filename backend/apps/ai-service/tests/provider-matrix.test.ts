import { afterEach, describe, expect, it } from "vitest";
import { createProvider, peekProviderChoice } from "../src/modules/ai/providers/factory.js";
import { AnthropicProvider } from "../src/modules/ai/providers/anthropic.js";
import { OpenAiProvider } from "../src/modules/ai/providers/openai.js";
import { MockPlanner } from "../src/modules/ai/providers/mock.js";

const KEYS = [
  "AI_PROVIDER",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "AI_OPENAI_MODEL",
  "OPENAI_BASE_URL",
  "AI_ANTHROPIC_MODEL",
] as const;

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe("provider factory — selection matrix", () => {
  it("default (unset AI_PROVIDER) → mock", () => {
    expect(peekProviderChoice()).toBe("mock");
    expect(createProvider()).toBeInstanceOf(MockPlanner);
  });

  it("AI_PROVIDER=mock forces mock even with keys", () => {
    process.env.AI_PROVIDER = "mock";
    process.env.ANTHROPIC_API_KEY = "a";
    process.env.OPENAI_API_KEY = "o";
    expect(peekProviderChoice()).toBe("mock");
    expect(createProvider().name).toBe("mock");
  });

  it("AI_PROVIDER=anthropic without key → mock", () => {
    process.env.AI_PROVIDER = "anthropic";
    expect(peekProviderChoice()).toBe("mock");
  });

  it("AI_PROVIDER=anthropic with key → anthropic", () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    expect(peekProviderChoice()).toBe("anthropic");
    expect(createProvider()).toBeInstanceOf(AnthropicProvider);
  });

  it("AI_PROVIDER=openai without key → mock", () => {
    process.env.AI_PROVIDER = "openai";
    expect(peekProviderChoice()).toBe("mock");
  });

  it("AI_PROVIDER=openai with key → openai", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-oai";
    expect(peekProviderChoice()).toBe("openai");
    expect(createProvider()).toBeInstanceOf(OpenAiProvider);
  });

  it("AI_PROVIDER=auto uppercase/lowercase", () => {
    process.env.AI_PROVIDER = "AUTO";
    process.env.OPENAI_API_KEY = "sk";
    expect(peekProviderChoice()).toBe("openai");
  });

  it("unknown AI_PROVIDER falls through auto logic", () => {
    process.env.AI_PROVIDER = "weird";
    expect(peekProviderChoice()).toBe("mock");
    process.env.ANTHROPIC_API_KEY = "a";
    expect(peekProviderChoice()).toBe("anthropic");
  });
});

describe("AnthropicProvider — failure modes (no network)", () => {
  it("throws when key missing", async () => {
    const p = new AnthropicProvider();
    await expect(p.nextStep({ message: "hi", toolResults: [] })).rejects.toThrow(/anthropic_failed/);
  });
});

describe("OpenAiProvider — failure modes (no network)", () => {
  it("throws when key missing", async () => {
    const p = new OpenAiProvider();
    await expect(p.nextStep({ message: "hi", toolResults: [] })).rejects.toThrow(/openai_failed/);
  });

  it("throws when model missing even with key", async () => {
    process.env.OPENAI_API_KEY = "sk";
    delete process.env.AI_OPENAI_MODEL;
    const p = new OpenAiProvider();
    await expect(p.nextStep({ message: "hi", toolResults: [] })).rejects.toThrow(/AI_OPENAI_MODEL/);
  });
});
