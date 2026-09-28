import { toolDefinitionsForLlm } from "../tools/registry.js";
import type { LLMProvider, PlanStep } from "./types.js";

const SYSTEM = `You are a read-only assistant for Manage Teams. Use only provided tools. Never invent URLs or entity IDs. Only describe data returned by tools. Prefer Vietnamese if the user wrote Vietnamese.`;

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

/**
 * OpenAI-compatible Chat Completions + function tools (Codex gateway via OPENAI_BASE_URL).
 */
export class OpenAiProvider implements LLMProvider {
  name = "openai" as const;
  private messages: ChatMessage[] = [];

  async nextStep(input: {
    message: string;
    toolResults: Array<{ name: string; result: unknown }>;
  }): Promise<PlanStep> {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.AI_OPENAI_MODEL;
    if (!apiKey) throw new Error("openai_failed: missing key");
    if (!model) throw new Error("openai_failed: missing AI_OPENAI_MODEL");

    const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const tools = toolDefinitionsForLlm().map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    if (input.toolResults.length === 0) {
      this.messages = [
        { role: "system", content: SYSTEM },
        { role: "user", content: input.message },
      ];
    } else {
      const last = this.messages.at(-1);
      const calls = last?.tool_calls ?? [];
      for (let i = 0; i < input.toolResults.length; i++) {
        const tr = input.toolResults[i]!;
        this.messages.push({
          role: "tool",
          tool_call_id: calls[i]?.id ?? `call_${i}`,
          content: JSON.stringify(tr.result),
        });
      }
    }

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: this.messages,
        tools,
        tool_choice: "auto",
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`openai_failed: ${res.status} ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: ChatMessage }>;
    };
    const msg = json.choices?.[0]?.message;
    if (!msg) throw new Error("openai_failed: empty response");

    this.messages.push(msg);

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      return {
        kind: "tools",
        calls: msg.tool_calls.map((c) => {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(c.function.arguments || "{}") as Record<string, unknown>;
          } catch {
            args = {};
          }
          return { name: c.function.name, args };
        }),
      };
    }

    return { kind: "final", answer: (msg.content ?? "").trim() || "Không có kết quả." };
  }
}
