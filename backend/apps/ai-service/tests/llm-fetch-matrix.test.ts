import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../src/modules/ai/providers/anthropic.js";
import { OpenAiProvider } from "../src/modules/ai/providers/openai.js";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_OPENAI_MODEL;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.AI_ANTHROPIC_MODEL;
});

describe("AnthropicProvider — fetch matrix", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("tool_use response → tools step", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "tool_use",
              id: "tu1",
              name: "list_my_tasks",
              input: { openOnly: true },
            },
          ],
        }),
      })),
    );
    const p = new AnthropicProvider();
    const step = await p.nextStep({ message: "việc mở", toolResults: [] });
    expect(step).toEqual({
      kind: "tools",
      calls: [{ name: "list_my_tasks", args: { openOnly: true } }],
    });
  });

  it("text response → final step", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "  Xin chào  " }],
        }),
      })),
    );
    const p = new AnthropicProvider();
    const step = await p.nextStep({ message: "hi", toolResults: [] });
    expect(step).toEqual({ kind: "final", answer: "Xin chào" });
  });

  it("HTTP error → throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => "unauthorized",
      })),
    );
    const p = new AnthropicProvider();
    await expect(p.nextStep({ message: "hi", toolResults: [] })).rejects.toThrow(/401/);
  });

  it("empty text content → default Vietnamese final", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ content: [] }),
      })),
    );
    const p = new AnthropicProvider();
    const step = await p.nextStep({ message: "hi", toolResults: [] });
    expect(step.kind).toBe("final");
    if (step.kind === "final") expect(step.answer).toContain("Không có kết quả");
  });
});

describe("OpenAiProvider — fetch matrix", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.AI_OPENAI_MODEL = "gpt-test";
  });

  it("function tool_calls → tools step", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: "assistant",
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: { name: "sync_status", arguments: "{}" },
                  },
                ],
              },
            },
          ],
        }),
      })),
    );
    const p = new OpenAiProvider();
    const step = await p.nextStep({ message: "sync", toolResults: [] });
    expect(step).toEqual({
      kind: "tools",
      calls: [{ name: "sync_status", args: {} }],
    });
  });

  it("invalid JSON args → empty object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: "assistant",
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: { name: "get_task", arguments: "not-json" },
                  },
                ],
              },
            },
          ],
        }),
      })),
    );
    const p = new OpenAiProvider();
    const step = await p.nextStep({ message: "x", toolResults: [] });
    expect(step.kind).toBe("tools");
    if (step.kind === "tools") expect(step.calls[0]?.args).toEqual({});
  });

  it("content message → final", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: "assistant", content: "Done" } }],
        }),
      })),
    );
    const p = new OpenAiProvider();
    const step = await p.nextStep({ message: "x", toolResults: [] });
    expect(step).toEqual({ kind: "final", answer: "Done" });
  });

  it("empty choices → throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [] }),
      })),
    );
    const p = new OpenAiProvider();
    await expect(p.nextStep({ message: "x", toolResults: [] })).rejects.toThrow(/empty response/);
  });

  it("uses custom OPENAI_BASE_URL", async () => {
    process.env.OPENAI_BASE_URL = "https://codex.example/v1/";
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: "assistant", content: "ok" } }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const p = new OpenAiProvider();
    await p.nextStep({ message: "x", toolResults: [] });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://codex.example/v1/chat/completions");
  });
});
