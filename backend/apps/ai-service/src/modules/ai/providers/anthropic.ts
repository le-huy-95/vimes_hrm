import { toolDefinitionsForLlm } from "../tools/registry.js";
import type { LLMProvider, PlanStep } from "./types.js";

const SYSTEM = `You are a read-only assistant for Manage Teams. Use only provided tools. Never invent URLs or entity IDs. Only describe data returned by tools. Prefer Vietnamese if the user wrote Vietnamese.`;

type AnthropicContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContent[];
};

/**
 * Claude Messages API + tool_use. Throws on HTTP/network errors for orchestrator fallback.
 */
export class AnthropicProvider implements LLMProvider {
  name = "anthropic" as const;
  private history: AnthropicMessage[] = [];

  async nextStep(input: {
    message: string;
    toolResults: Array<{ name: string; result: unknown }>;
  }): Promise<PlanStep> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("anthropic_failed: missing key");

    const model = process.env.AI_ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
    const tools = toolDefinitionsForLlm().map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    if (input.toolResults.length === 0) {
      this.history = [{ role: "user", content: input.message }];
    } else {
      const lastAssistant = this.history.filter((m) => m.role === "assistant").at(-1);
      const toolUses =
        typeof lastAssistant?.content === "object"
          ? (lastAssistant.content as AnthropicContent[]).filter((c) => c.type === "tool_use")
          : [];
      this.history.push({
        role: "user",
        content: input.toolResults.map((tr, i) => ({
          type: "tool_result" as const,
          tool_use_id: (toolUses[i] as { id?: string } | undefined)?.id ?? `tool_${i}`,
          content: JSON.stringify(tr.result),
        })) as unknown as AnthropicContent[],
      });
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: SYSTEM,
        tools,
        messages: this.history,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`anthropic_failed: ${res.status} ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      content: AnthropicContent[];
      stop_reason?: string;
    };
    this.history.push({ role: "assistant", content: json.content });

    const toolUses = json.content.filter((c): c is Extract<AnthropicContent, { type: "tool_use" }> => c.type === "tool_use");
    if (toolUses.length > 0) {
      return {
        kind: "tools",
        calls: toolUses.map((t) => ({ name: t.name, args: t.input ?? {} })),
      };
    }

    const text = json.content
      .filter((c): c is Extract<AnthropicContent, { type: "text" }> => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim();
    return { kind: "final", answer: text || "Không có kết quả." };
  }
}
