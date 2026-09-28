# Phase 6a AI Read-Only Deepen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen `ai-service` Phase 6a so read-only chat returns permission-checked entity links via a tool registry, MockPlanner / Anthropic / OpenAI(Codex-compatible) providers, SSE, and rate/budget limits.

**Architecture:** Orchestrator selects an `LLMProvider` (`AI_PROVIDER=auto|mock|anthropic|openai`), runs ≤8 tool rounds against Prisma read tools, then `link-resolver` filters every link. No due-date field; open tasks by status. No new DB migration.

**Tech Stack:** Express, TypeScript, Prisma (`@manage-teams/db`), Zod, Vitest, `fetch` for Anthropic/OpenAI HTTP (no SDK required for deepen).

**Spec:** `docs/superpowers/specs/2026-09-28-phase-6a-deepen-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `backend/apps/ai-service/src/modules/ai/link-resolver.ts` | Build href + verify membership; drop invalid |
| `backend/apps/ai-service/src/modules/ai/tools/types.ts` | Tool names, args, `ToolContext`, `ToolResult` |
| `backend/apps/ai-service/src/modules/ai/tools/registry.ts` | Dispatch `executeTool(name, args, ctx)` |
| `backend/apps/ai-service/src/modules/ai/tools/*.ts` | One file per tool or grouped `read-tools.ts` |
| `backend/apps/ai-service/src/modules/ai/providers/types.ts` | `LLMProvider`, usage, plan result |
| `backend/apps/ai-service/src/modules/ai/providers/mock.ts` | Heuristic MockPlanner |
| `backend/apps/ai-service/src/modules/ai/providers/anthropic.ts` | Claude messages + tools |
| `backend/apps/ai-service/src/modules/ai/providers/openai.ts` | OpenAI-compatible chat completions + tools |
| `backend/apps/ai-service/src/modules/ai/providers/factory.ts` | `createProvider()` from env |
| `backend/apps/ai-service/src/modules/ai/orchestrator.ts` | Session, loop, resolve links, audit |
| `backend/apps/ai-service/src/modules/ai/rate-limit.ts` | Per-min + daily token budget |
| `backend/apps/ai-service/src/modules/ai/ai.service.ts` | Thin wrapper → orchestrator |
| `backend/apps/ai-service/src/modules/ai/ai.controller.ts` | Wire rate-limit; SSE `provider` |
| `backend/apps/ai-service/src/modules/ai/ai.routes.ts` | Attach rate-limit middleware |
| `backend/apps/ai-service/tests/*.test.ts` | Unit tests (no live LLM keys) |
| `backend/apps/ai-service/README.md` | Operator docs |
| `backend/docs/runbooks/phase-6a-deepen.md` | Deepen runbook |
| `backend/.env.example` | New AI_* / OPENAI_* vars |

Keep existing 6c/6d/6e routes; do not call `search_messages` from the 6a orchestrator by default.

---

### Task 1: Vitest harness for ai-service

**Files:**
- Modify: `backend/apps/ai-service/package.json`
- Create: `backend/apps/ai-service/vitest.config.ts`
- Create: `backend/apps/ai-service/tests/smoke.test.ts`

- [ ] **Step 1: Add vitest dependency and scripts**

In `package.json` set:

```json
"scripts": {
  "build": "tsc -p tsconfig.json",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "dev": "tsx watch src/index.ts",
  "start": "node dist/index.js",
  "test": "vitest run --passWithNoTests",
  "lint": "echo \"no lint yet\""
},
"devDependencies": {
  "@types/express": "^5.0.0",
  "@types/node": "^22.10.2",
  "tsx": "^4.19.2",
  "typescript": "^5.7.2",
  "vitest": "^2.1.8"
}
```

- [ ] **Step 2: Add vitest config**

```ts
// backend/apps/ai-service/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Smoke test**

```ts
// backend/apps/ai-service/tests/smoke.test.ts
import { describe, expect, it } from "vitest";

describe("ai-service test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Install and run**

Run from `backend/`:

```bash
pnpm --filter @manage-teams/ai-service install
pnpm --filter @manage-teams/ai-service test
```

Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/ai-service/package.json backend/apps/ai-service/vitest.config.ts backend/apps/ai-service/tests/smoke.test.ts backend/pnpm-lock.yaml
git commit -m "test(ai-service): add vitest harness for Phase 6a"
```

---

### Task 2: Link resolver (TDD)

**Files:**
- Create: `backend/apps/ai-service/src/modules/ai/link-resolver.ts`
- Create: `backend/apps/ai-service/tests/link-resolver.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// backend/apps/ai-service/tests/link-resolver.test.ts
import { describe, expect, it, vi } from "vitest";
import { buildEntityHref, resolveLinks } from "../src/modules/ai/link-resolver.js";

describe("buildEntityHref", () => {
  it("builds task href", () => {
    expect(
      buildEntityHref("http://localhost:3000", {
        type: "task",
        id: "t1",
        groupId: "g1",
        code: "T-1",
      }),
    ).toBe("http://localhost:3000/groups/g1/tasks/T-1");
  });

  it("builds group href", () => {
    expect(
      buildEntityHref("http://app", { type: "group", id: "g1" }),
    ).toBe("http://app/groups/g1");
  });
});

describe("resolveLinks", () => {
  it("keeps allowed task, drops denied", async () => {
    const check = vi.fn(async (c: { type: string; id: string }) => c.id === "ok");
    const links = await resolveLinks(
      "http://app",
      [
        { type: "task", id: "ok", groupId: "g", code: "T-1", label: "A" },
        { type: "task", id: "no", groupId: "g", code: "T-2", label: "B" },
      ],
      check,
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.id).toBe("ok");
    expect(links[0]?.href).toContain("/tasks/T-1");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

```bash
pnpm --filter @manage-teams/ai-service test
```

Expected: FAIL cannot find module / export.

- [ ] **Step 3: Implement link-resolver**

```ts
// backend/apps/ai-service/src/modules/ai/link-resolver.ts
export type LinkCandidate = {
  type: string;
  id: string;
  label: string;
  groupId?: string;
  code?: string;
};

export type AiLink = {
  type: string;
  id: string;
  href: string;
  label: string;
};

export type AccessCheck = (c: LinkCandidate) => Promise<boolean>;

export function buildEntityHref(
  appPublicUrl: string,
  c: Pick<LinkCandidate, "type" | "id" | "groupId" | "code">,
): string | null {
  const base = appPublicUrl.replace(/\/$/, "");
  if (c.type === "task" && c.groupId && c.code) {
    return `${base}/groups/${c.groupId}/tasks/${c.code}`;
  }
  if (c.type === "group") return `${base}/groups/${c.id}`;
  if (c.type === "conversation") return `${base}/conversations/${c.id}`;
  return null;
}

export async function resolveLinks(
  appPublicUrl: string,
  candidates: LinkCandidate[],
  checkAccess: AccessCheck,
): Promise<AiLink[]> {
  const out: AiLink[] = [];
  for (const c of candidates) {
    if (!(await checkAccess(c))) continue;
    const href = buildEntityHref(appPublicUrl, c);
    if (!href) continue;
    out.push({ type: c.type, id: c.id, href, label: c.label });
  }
  return out;
}
```

Also export `createPrismaAccessCheck(userId)` in the same file (or `link-access.ts`) that queries Prisma for task membership / group membership / conversation member — used by orchestrator.

```ts
import { prismaRead } from "@manage-teams/db";

export function createPrismaAccessCheck(userId: string): AccessCheck {
  return async (c) => {
    if (c.type === "task") {
      const task = await prismaRead.task.findFirst({
        where: {
          id: c.id,
          deletedAt: null,
          group: { members: { some: { userId, status: "ACTIVE" } } },
        },
        select: { id: true },
      });
      return Boolean(task);
    }
    if (c.type === "group") {
      const m = await prismaRead.groupMember.findFirst({
        where: { groupId: c.id, userId, status: "ACTIVE" },
        select: { userId: true },
      });
      return Boolean(m);
    }
    if (c.type === "conversation") {
      const m = await prismaRead.conversationMember.findFirst({
        where: { conversationId: c.id, userId },
        select: { userId: true },
      });
      return Boolean(m);
    }
    return false;
  };
}
```

(Adjust `conversationMember` field names to match `schema.prisma` if different.)

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @manage-teams/ai-service test
```

- [ ] **Step 5: Commit**

```bash
git add backend/apps/ai-service/src/modules/ai/link-resolver.ts backend/apps/ai-service/tests/link-resolver.test.ts
git commit -m "feat(ai-service): add link resolver with access checks"
```

---

### Task 3: Tool types + registry + read tools

**Files:**
- Create: `backend/apps/ai-service/src/modules/ai/tools/types.ts`
- Create: `backend/apps/ai-service/src/modules/ai/tools/read-tools.ts`
- Create: `backend/apps/ai-service/src/modules/ai/tools/registry.ts`
- Create: `backend/apps/ai-service/tests/mock-planner.test.ts` (planner in Task 4; here add `registry.test.ts` for `get_report_link`)

- [ ] **Step 1: Types**

```ts
// tools/types.ts
import type { LinkCandidate } from "../link-resolver.js";

export const READ_TOOLS = [
  "list_my_tasks",
  "search_tasks",
  "get_task",
  "get_group",
  "list_members",
  "workload_summary",
  "get_report_link",
  "sync_status",
] as const;

export type ReadToolName = (typeof READ_TOOLS)[number];

export type ToolContext = { userId: string };

export type ToolResult = {
  data: unknown;
  linkCandidates: LinkCandidate[];
};
```

- [ ] **Step 2: Implement tools in `read-tools.ts`**

Rules from spec:
- Membership via ACTIVE `groupMember`.
- Open tasks: `status` in `TODO` | `IN_PROGRESS` (and assignee ACTIVE); include DONE only when tool args ask.
- `get_report_link` → `{ available: false }`, `linkCandidates: []`.
- `sync_status` → recent `syncJob` rows for user + google account presence; never tokens.
- Each tool returns `linkCandidates` for entities it surfaces.

Sketch for `list_my_tasks`:

```ts
import { prismaRead } from "@manage-teams/db";
import type { ToolContext, ToolResult } from "./types.js";

const OPEN = ["TODO", "IN_PROGRESS"];

export async function listMyTasks(ctx: ToolContext, args: { openOnly?: boolean } = {}): Promise<ToolResult> {
  const openOnly = args.openOnly !== false;
  const memberships = await prismaRead.groupMember.findMany({
    where: { userId: ctx.userId, status: "ACTIVE" },
    select: { groupId: true },
  });
  const groupIds = memberships.map((m) => m.groupId);
  if (groupIds.length === 0) return { data: [], linkCandidates: [] };

  const tasks = await prismaRead.task.findMany({
    where: {
      groupId: { in: groupIds },
      deletedAt: null,
      ...(openOnly ? { status: { in: OPEN } } : {}),
      assignees: { some: { userId: ctx.userId, status: { in: ["ACTIVE", "DONE"] } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { id: true, groupId: true, code: true, title: true, status: true },
  });

  return {
    data: tasks,
    linkCandidates: tasks.map((t) => ({
      type: "task",
      id: t.id,
      groupId: t.groupId,
      code: t.code,
      label: `${t.code}: ${t.title}`,
    })),
  };
}
```

Implement the other seven tools similarly in the same file (YAGNI: keep helpers private in-file).

- [ ] **Step 3: Registry**

```ts
// tools/registry.ts
import type { ReadToolName, ToolContext, ToolResult } from "./types.js";
import * as tools from "./read-tools.js";

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  switch (name as ReadToolName) {
    case "list_my_tasks":
      return tools.listMyTasks(ctx, args as { openOnly?: boolean });
    case "search_tasks":
      return tools.searchTasks(ctx, args as { q?: string; status?: string });
    case "get_task":
      return tools.getTask(ctx, args as { taskId?: string; code?: string; groupId?: string });
    case "get_group":
      return tools.getGroup(ctx, args as { groupId: string });
    case "list_members":
      return tools.listMembers(ctx, args as { groupId: string });
    case "workload_summary":
      return tools.workloadSummary(ctx);
    case "get_report_link":
      return tools.getReportLink();
    case "sync_status":
      return tools.syncStatus(ctx);
    default:
      return { data: { error: `unknown_tool:${name}` }, linkCandidates: [] };
  }
}

export function toolDefinitionsForLlm(): Array<{
  name: ReadToolName;
  description: string;
  parameters: Record<string, unknown>;
}> {
  // JSON-schema-ish parameter objects for Anthropic/OpenAI tool lists
  return [
    { name: "list_my_tasks", description: "List the user open tasks", parameters: { type: "object", properties: { openOnly: { type: "boolean" } } } },
    { name: "search_tasks", description: "Search tasks by keyword/status", parameters: { type: "object", properties: { q: { type: "string" }, status: { type: "string" } } } },
    { name: "get_task", description: "Get one task by id or groupId+code", parameters: { type: "object", properties: { taskId: { type: "string" }, groupId: { type: "string" }, code: { type: "string" } } } },
    { name: "get_group", description: "Get group metadata", parameters: { type: "object", properties: { groupId: { type: "string" } }, required: ["groupId"] } },
    { name: "list_members", description: "List active group members", parameters: { type: "object", properties: { groupId: { type: "string" } }, required: ["groupId"] } },
    { name: "workload_summary", description: "Counts of open tasks by status", parameters: { type: "object", properties: {} } },
    { name: "get_report_link", description: "Report links if available", parameters: { type: "object", properties: {} } },
    { name: "sync_status", description: "Google sync status for user", parameters: { type: "object", properties: {} } },
  ];
}
```

- [ ] **Step 4: Unit test get_report_link (no DB)**

```ts
// tests/get-report-link.test.ts
import { describe, expect, it } from "vitest";
import { getReportLink } from "../src/modules/ai/tools/read-tools.js";

describe("get_report_link", () => {
  it("is unavailable", async () => {
    const r = await getReportLink();
    expect(r.data).toEqual({ available: false });
    expect(r.linkCandidates).toEqual([]);
  });
});
```

Export `getReportLink` from `read-tools.ts`.

- [ ] **Step 5: Run tests + commit**

```bash
pnpm --filter @manage-teams/ai-service test
git add backend/apps/ai-service/src/modules/ai/tools backend/apps/ai-service/tests/get-report-link.test.ts
git commit -m "feat(ai-service): add Phase 6a read-only tool registry"
```

---

### Task 4: MockPlanner provider

**Files:**
- Create: `backend/apps/ai-service/src/modules/ai/providers/types.ts`
- Create: `backend/apps/ai-service/src/modules/ai/providers/mock.ts`
- Create: `backend/apps/ai-service/tests/mock-planner.test.ts`

- [ ] **Step 1: Provider types**

```ts
// providers/types.ts
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
```

- [ ] **Step 2: Failing tests for heuristic**

```ts
import { describe, expect, it } from "vitest";
import { MockPlanner } from "../src/modules/ai/providers/mock.js";

describe("MockPlanner", () => {
  const p = new MockPlanner();

  it("plans list_my_tasks for open-work question", async () => {
    const step = await p.nextStep({ message: "Việc nào của tôi đang mở? Cho link", toolResults: [] });
    expect(step.kind).toBe("tools");
    if (step.kind === "tools") {
      expect(step.calls.map((c) => c.name)).toContain("list_my_tasks");
    }
  });

  it("finalizes after tool results", async () => {
    const step = await p.nextStep({
      message: "Việc đang mở",
      toolResults: [{ name: "list_my_tasks", result: [{ code: "T-1" }] }],
    });
    expect(step.kind).toBe("final");
  });

  it("plans sync_status for google sync ask", async () => {
    const step = await p.nextStep({ message: "trạng thái đồng bộ google", toolResults: [] });
    expect(step.kind).toBe("tools");
    if (step.kind === "tools") expect(step.calls[0]?.name).toBe("sync_status");
  });
});
```

- [ ] **Step 3: Implement MockPlanner**

```ts
// providers/mock.ts
import type { LLMProvider, PlanStep } from "./types.js";

export class MockPlanner implements LLMProvider {
  name = "mock" as const;

  async nextStep(input: {
    message: string;
    toolResults: Array<{ name: string; result: unknown }>;
  }): Promise<PlanStep> {
    if (input.toolResults.length > 0) {
      const n = Array.isArray(input.toolResults[0]?.result)
        ? (input.toolResults[0].result as unknown[]).length
        : 1;
      return {
        kind: "final",
        answer:
          n > 0
            ? `Tìm thấy kết quả trong quyền của bạn (${input.toolResults.map((t) => t.name).join(", ")}).`
            : "Không có kết quả phù hợp trong quyền của bạn.",
      };
    }
    const m = input.message.toLowerCase();
    if (/sync|google|đồng bộ/.test(m)) {
      return { kind: "tools", calls: [{ name: "sync_status", args: {} }] };
    }
    if (/thành viên|member|nhóm|group/.test(m) && /list|ai|who|thành viên/.test(m)) {
      return { kind: "tools", calls: [{ name: "workload_summary", args: {} }] };
    }
    if (/workload|khối lượng|tóm tắt|summary/.test(m)) {
      return { kind: "tools", calls: [{ name: "workload_summary", args: {} }] };
    }
    if (/task|việc|mở|todo|công việc|link|hạn/.test(m)) {
      return { kind: "tools", calls: [{ name: "list_my_tasks", args: { openOnly: true } }] };
    }
    return { kind: "tools", calls: [{ name: "list_my_tasks", args: { openOnly: true } }] };
  }
}
```

- [ ] **Step 4: Run tests + commit**

```bash
pnpm --filter @manage-teams/ai-service test
git add backend/apps/ai-service/src/modules/ai/providers backend/apps/ai-service/tests/mock-planner.test.ts
git commit -m "feat(ai-service): add MockPlanner LLM provider"
```

---

### Task 5: Provider factory + Anthropic + OpenAI stubs

**Files:**
- Create: `backend/apps/ai-service/src/modules/ai/providers/factory.ts`
- Create: `backend/apps/ai-service/src/modules/ai/providers/anthropic.ts`
- Create: `backend/apps/ai-service/src/modules/ai/providers/openai.ts`
- Create: `backend/apps/ai-service/tests/provider-factory.test.ts`

- [ ] **Step 1: Factory tests**

```ts
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
```

- [ ] **Step 2: Implement factory**

```ts
// providers/factory.ts
import type { LLMProvider, ProviderName } from "./types.js";
import { MockPlanner } from "./mock.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAiProvider } from "./openai.js";

export function peekProviderChoice(): ProviderName {
  const mode = (process.env.AI_PROVIDER ?? "auto").toLowerCase();
  if (mode === "mock") return "mock";
  if (mode === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : "mock";
  if (mode === "openai") return process.env.OPENAI_API_KEY ? "openai" : "mock";
  // auto
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
```

- [ ] **Step 3: AnthropicProvider**

Use `fetch` to `https://api.anthropic.com/v1/messages` with tool_use. Map `toolDefinitionsForLlm()` into Anthropic tools format. On each `nextStep`:
- If no toolResults yet: send user message, parse `tool_use` blocks → `{ kind: "tools", calls }`.
- If toolResults present: send `tool_result` messages, parse either more tools or final text.

Env: `ANTHROPIC_API_KEY`, `AI_ANTHROPIC_MODEL` default `claude-sonnet-4-20250514` (override via env; do not hardcode forever in docs).

System prompt (constant):

```
You are a read-only assistant for Manage Teams. Use only provided tools. Never invent URLs or entity IDs. Only describe data returned by tools. Prefer Vietnamese if the user wrote Vietnamese.
```

If `fetch` throws / non-OK: throw `Error("anthropic_failed")` so orchestrator can fallback.

- [ ] **Step 4: OpenAiProvider**

`POST ${OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions` with `tools` function calling. Require `AI_OPENAI_MODEL` when selected. Same `nextStep` contract as Anthropic. Auth header `Bearer ${OPENAI_API_KEY}`.

- [ ] **Step 5: Run factory tests + commit**

```bash
pnpm --filter @manage-teams/ai-service test
git add backend/apps/ai-service/src/modules/ai/providers backend/apps/ai-service/tests/provider-factory.test.ts
git commit -m "feat(ai-service): add Anthropic and OpenAI LLM providers"
```

Do **not** call live APIs in CI tests.

---

### Task 6: Rate limit + token budget

**Files:**
- Create: `backend/apps/ai-service/src/modules/ai/rate-limit.ts`
- Create: `backend/apps/ai-service/tests/rate-limit.test.ts`
- Modify: `backend/apps/ai-service/src/modules/ai/ai.routes.ts`
- Modify: `backend/apps/ai-service/src/modules/ai/ai.controller.ts` (only if middleware needs `req.userId` set — prefer reading JWT inside middleware via `requireUser` pattern or set userId in a prior auth middleware)

- [ ] **Step 1: Tests for bucket helper**

```ts
import { describe, expect, it } from "vitest";
import { checkAiRateLimit, resetAiRateLimitForTests, addTokenUsage } from "../src/modules/ai/rate-limit.js";

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
```

- [ ] **Step 2: Implement** (mirror chat-service in-memory Map; window 60s; day key `budget:${userId}:${yyyy-mm-dd}`)

```ts
import { AppError } from "@manage-teams/lib";
import type { RequestHandler } from "express";
import { requireUser } from "@manage-teams/lib";

// export checkAiRateLimit(userId), addTokenUsage(userId, n), resetAiRateLimitForTests()
// export function aiChatRateLimit(): RequestHandler that requireUser + checkAiRateLimit
```

Wire `aiChatRateLimit` on `POST /ai/chat` and `POST /ai/chat/stream` only (not ping/admin/internal).

- [ ] **Step 3: Run tests + commit**

```bash
pnpm --filter @manage-teams/ai-service test
git add backend/apps/ai-service/src/modules/ai/rate-limit.ts backend/apps/ai-service/tests/rate-limit.test.ts backend/apps/ai-service/src/modules/ai/ai.routes.ts
git commit -m "feat(ai-service): add chat rate limit and daily token budget"
```

---

### Task 7: Orchestrator + wire chat/SSE

**Files:**
- Create: `backend/apps/ai-service/src/modules/ai/orchestrator.ts`
- Modify: `backend/apps/ai-service/src/modules/ai/ai.service.ts`
- Modify: `backend/apps/ai-service/src/modules/ai/ai.controller.ts`
- Modify: `backend/apps/ai-service/src/app.ts` (comment update)
- Create: `backend/apps/ai-service/tests/orchestrator-fallback.test.ts`

- [ ] **Step 1: Orchestrator algorithm**

```ts
export async function runChat(input: {
  userId: string;
  message: string;
  sessionId?: string;
}): Promise<{
  sessionId: string;
  answer: string;
  links: AiLink[];
  toolsUsed: string[];
  mock: boolean;
  provider: ProviderName;
  usage: Usage;
}> {
  // 1. validate message
  // 2. session create/find
  // 3. provider = createProvider(); let used = provider; let mock = provider.name === "mock"
  // 4. candidates = []; toolsUsed = []; toolResults = []; usage = {0,0}
  // 5. for round in 1..AI_MAX_TOOL_ROUNDS (with AbortSignal timeout AI_CHAT_TIMEOUT_MS):
  //      step = await used.nextStep({ message, toolResults })
  //      if tools: execute each via executeTool; push results + linkCandidates
  //      if final: answer = step.answer; break
  // 6. on provider throw once: if !AI_REQUIRE_LLM → used = new MockPlanner(); mock=true; continue loop once from scratch toolResults=[]
  // 7. links = await resolveLinks(APP_PUBLIC_URL, candidates, createPrismaAccessCheck(userId))
  // 8. addTokenUsage(userId, usage.prompt+completion)
  // 9. ai_audit create with via, toolsUsed, linkCount, mock, provider, usage
  // 10. return
}
```

- [ ] **Step 2: Fallback unit test with fake provider**

Inject optional `provider` override on `runChat` **or** test a small `withFallback(primary, fallback)` helper:

```ts
export async function nextStepWithFallback(
  primary: LLMProvider,
  fallback: LLMProvider,
  input: Parameters<LLMProvider["nextStep"]>[0],
  requireLlm: boolean,
): Promise<{ step: PlanStep; provider: LLMProvider; mock: boolean }> {
  try {
    return { step: await primary.nextStep(input), provider: primary, mock: primary.name === "mock" };
  } catch {
    if (requireLlm) throw new AppError("LLM provider failed", "AI_PROVIDER", 502);
    return { step: await fallback.nextStep(input), provider: fallback, mock: true };
  }
}
```

Test: primary throws → fallback mock final/tools.

- [ ] **Step 3: Replace body of `ai.service.ts` to re-export `runChat` from orchestrator**; keep `ChatResult` type including `provider` + `usage`.

- [ ] **Step 4: Update controller SSE `meta` to include `provider`; JSON chat returns new fields.**

- [ ] **Step 5: Stop default orchestrator from calling `search_messages` / semantic.**

- [ ] **Step 6: typecheck + test + commit**

```bash
pnpm --filter @manage-teams/ai-service typecheck
pnpm --filter @manage-teams/ai-service test
git add backend/apps/ai-service/src/modules/ai backend/apps/ai-service/tests/orchestrator-fallback.test.ts
git commit -m "feat(ai-service): wire 6a orchestrator with provider fallback"
```

---

### Task 8: Docs + env example

**Files:**
- Modify: `backend/apps/ai-service/README.md`
- Create: `backend/docs/runbooks/phase-6a-deepen.md`
- Modify: `backend/.env.example`
- Modify: `backend/docs/runbooks/phase-4-5-deepen.md` — change “Phase 6: tạm chưa làm” to point at phase-6a-deepen.md

- [ ] **Step 1: README** — ports, routes, provider env table, example curl for `/ai/chat`, note Codex uses `OPENAI_*` not `ANTHROPIC_*`.

- [ ] **Step 2: Runbook** — acceptance checklist (open tasks + links; cross-group; resolver), mock vs live, rate-limit codes.

- [ ] **Step 3: `.env.example` append:**

```bash
# Phase 6a — AI
# AI_PROVIDER=auto
# AI_REQUIRE_LLM=false
# AI_MAX_TOOL_ROUNDS=8
# AI_CHAT_TIMEOUT_MS=30000
# AI_RATE_LIMIT_PER_MIN=10
# AI_TOKEN_BUDGET_PER_DAY=200000
# ANTHROPIC_API_KEY=
# AI_ANTHROPIC_MODEL=claude-sonnet-4-20250514
# OPENAI_API_KEY=
# OPENAI_BASE_URL=https://api.openai.com/v1
# AI_OPENAI_MODEL=
# APP_PUBLIC_URL=http://localhost:3000
```

- [ ] **Step 4: Commit**

```bash
git add backend/apps/ai-service/README.md backend/docs/runbooks/phase-6a-deepen.md backend/docs/runbooks/phase-4-5-deepen.md backend/.env.example
git commit -m "docs: Phase 6a deepen runbook and AI env examples"
```

---

### Task 9: Verification gate

- [ ] **Step 1: Run full ai-service checks**

```bash
pnpm --filter @manage-teams/ai-service typecheck
pnpm --filter @manage-teams/ai-service test
```

Expected: all PASS; no LLM keys required.

- [ ] **Step 2: Manual smoke (optional, local DB + JWT)**

```bash
curl -s -X POST http://localhost:3205/ai/chat \
  -H "Authorization: Bearer $ACCESS_JWT" \
  -H "content-type: application/json" \
  -d '{"message":"Việc nào của tôi đang mở? Cho link"}'
```

Expected: `provider:"mock"` (without keys), `links` only for membership tasks.

- [ ] **Step 3: Final commit only if uncommitted fixes remain**

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| 6a only / no 6b write | Tasks 3, 7 |
| Mock-first + Anthropic + OpenAI | Tasks 4–5, 7 |
| Prisma tools | Task 3 |
| Link resolver | Task 2 |
| No dueAt / open tasks | Task 3 |
| get_report_link unavailable | Task 3 |
| Rate + budget | Task 6 |
| SSE + provider field | Task 7 |
| Audit via ai-assistant | Task 7 |
| Docs / env | Task 8 |
| CI without keys | Tasks 1, 5, 9 |

## Out of plan (follow spec follow-ups)

dueAt, real reports, HTTP-to-core tools, session transcripts, 6b–6e deepen, proprietary Codex SDK.
