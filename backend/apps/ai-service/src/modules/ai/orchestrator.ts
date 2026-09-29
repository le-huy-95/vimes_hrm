import { prismaRead, prismaWrite } from "@manage-teams/db";
import { AppError } from "@manage-teams/lib";
import {
  createPrismaAccessCheck,
  resolveLinks,
  type AiLink,
  type LinkCandidate,
} from "./link-resolver.js";
import { executeTool } from "./tools/registry.js";
import { createProvider } from "./providers/factory.js";
import { MockPlanner } from "./providers/mock.js";
import type { LLMProvider, PlanStep, ProviderName, Usage } from "./providers/types.js";
import { addTokenUsage } from "./rate-limit.js";

const appPublicUrl = (process.env.APP_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
const maxRounds = Number(process.env.AI_MAX_TOOL_ROUNDS ?? 8);
const timeoutMs = Number(process.env.AI_CHAT_TIMEOUT_MS ?? 30_000);

export type ChatResult = {
  sessionId: string;
  answer: string;
  links: AiLink[];
  toolsUsed: string[];
  mock: boolean;
  provider: ProviderName;
  usage: Usage;
};

export async function nextStepWithFallback(
  primary: LLMProvider,
  fallback: LLMProvider,
  input: Parameters<LLMProvider["nextStep"]>[0],
  requireLlm: boolean,
): Promise<{ step: PlanStep; provider: LLMProvider; mock: boolean }> {
  try {
    return {
      step: await primary.nextStep(input),
      provider: primary,
      mock: primary.name === "mock",
    };
  } catch {
    if (requireLlm) throw new AppError("Nhà cung cấp AI thất bại", "AI_PROVIDER", 502);
    return {
      step: await fallback.nextStep(input),
      provider: fallback,
      mock: true,
    };
  }
}

export async function runChat(input: {
  userId: string;
  message: string;
  sessionId?: string;
  /** Test injection */
  provider?: LLMProvider;
}): Promise<ChatResult> {
  const message = input.message.trim();
  if (!message) throw new AppError("Cần nội dung tin nhắn", "VALIDATION", 400);

  let sessionId = input.sessionId;
  if (sessionId) {
    const s = await prismaRead.aiSession.findFirst({
      where: { id: sessionId, userId: input.userId },
    });
    if (!s) throw new AppError("Không tìm thấy phiên chat", "NOT_FOUND", 404);
  } else {
    const s = await prismaWrite.aiSession.create({
      data: { userId: input.userId, title: message.slice(0, 80) },
    });
    sessionId = s.id;
  }

  const requireLlm = process.env.AI_REQUIRE_LLM === "true";
  let provider: LLMProvider = input.provider ?? createProvider();
  const fallback = new MockPlanner();
  let mock = provider.name === "mock";
  let usedProvider: ProviderName = provider.name;

  const toolsUsed: string[] = [];
  const candidates: LinkCandidate[] = [];
  let toolResults: Array<{ name: string; result: unknown }> = [];
  const usage: Usage = { promptTokens: 0, completionTokens: 0 };
  let answer = "Không có kết quả phù hợp.";

  const deadline = Date.now() + timeoutMs;
  let fellBack = false;

  for (let round = 0; round < maxRounds; round++) {
    if (Date.now() > deadline) {
      throw new AppError("Yêu cầu AI hết thời gian chờ", "AI_TIMEOUT", 504);
    }

    let step: PlanStep;
    try {
      const r = await nextStepWithFallback(provider, fallback, { message, toolResults }, requireLlm);
      step = r.step;
      mock = r.mock;
      usedProvider = r.provider.name;
      if (r.mock && provider.name !== "mock" && !fellBack) {
        fellBack = true;
        provider = fallback;
        toolResults = [];
        // Restart planning with mock after live failure
        if (round === 0 && step.kind === "tools") {
          // continue with this step from fallback
        }
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError("Yêu cầu AI thất bại", "AI_PROVIDER", 502);
    }

    if (step.kind === "final") {
      answer = step.answer;
      break;
    }

    for (const call of step.calls) {
      toolsUsed.push(call.name);
      const result = await executeTool(call.name, call.args ?? {}, { userId: input.userId });
      toolResults.push({ name: call.name, result: result.data });
      candidates.push(...result.linkCandidates);
    }
  }

  const links = await resolveLinks(appPublicUrl, candidates, createPrismaAccessCheck(input.userId));
  addTokenUsage(input.userId, usage.promptTokens + usage.completionTokens);

  await prismaWrite.aiAudit.create({
    data: {
      userId: input.userId,
      sessionId,
      kind: "chat",
      payload: {
        message,
        toolsUsed,
        linkCount: links.length,
        mock,
        provider: usedProvider,
        via: "ai-assistant",
        usage,
      },
    },
  });

  return {
    sessionId,
    answer,
    links,
    toolsUsed,
    mock,
    provider: usedProvider,
    usage,
  };
}
