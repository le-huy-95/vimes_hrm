export type ProviderName = "mock" | "anthropic" | "openai";

export type Usage = { promptTokens: number; completionTokens: number };

export type ToolCallRequest = { name: string; args: Record<string, unknown> };

/** One planning step: either call tools or finish with answer text. */
export type PlanStep =
  | { kind: "tools"; calls: ToolCallRequest[] }
  | { kind: "final"; answer: string };

export type LLMProvider = {
  name: ProviderName;
  /** Given user message + prior tool results, decide next step. */
  nextStep(input: {
    message: string;
    toolResults: Array<{ name: string; result: unknown }>;
  }): Promise<PlanStep>;
};
