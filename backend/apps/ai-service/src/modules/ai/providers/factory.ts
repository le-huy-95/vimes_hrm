import type { LLMProvider, ProviderName } from "./types.js";
import { MockPlanner } from "./mock.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAiProvider } from "./openai.js";

export function peekProviderChoice(): ProviderName {
  const mode = (process.env.AI_PROVIDER ?? "auto").toLowerCase();
  if (mode === "mock") return "mock";
  if (mode === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : "mock";
  if (mode === "openai") return process.env.OPENAI_API_KEY ? "openai" : "mock";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "mock";
}

export function createProvider(): LLMProvider {
  const choice = peekProviderChoice();
  if (choice === "anthropic") return new AnthropicProvider();
  if (choice === "openai") return new OpenAiProvider();
  return new MockPlanner();
}
