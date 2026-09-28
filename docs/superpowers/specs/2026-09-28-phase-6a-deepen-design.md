# Design: Deepen Phase 6a (AI read-only + links)

**Date:** 2026-09-28  
**Status:** Approved (chat)  
**Parent:** [v2.5](./2026-09-28-ke-hoach-trien-khai-v2.5-design.md), [v2.4 Phase 6a](./2026-09-28-ke-hoach-trien-khai-v2.4.md), scaffold [3/4/5/6a](./2026-09-28-phase-3-4-5-6a-scaffold-design.md)

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Scope | **6a only** (not 6b/6c/6d/6e) |
| Approach | Deepen chuẩn nghiệm thu (tool registry + link resolver + mock/LLM + SSE + rate/budget) |
| LLM | **Mock-first**: no `ANTHROPIC_API_KEY` → MockPlanner; with key → Anthropic tool-use; API fail → one MockPlanner fallback |
| Data access | **Prisma direct** in `ai-service` (HTTP-to-core deferred) |
| Due dates | Schema has **no task due field** → acceptance uses **open/active tasks**, not “overdue this week” |
| Reports | No report entity → `get_report_link` returns unavailable; never invent URLs |
| Session history | `sessionId` groups audit only; each chat request is independent (no message transcript store) |
| Usage | Rate/budget via in-memory or Redis buckets + `ai_audit` payload; **no new `ai_usage` table** in this deepen |

## Out of scope

- 6b write tools / `ai_pending_actions`
- 6c semantic search / embeddings / Kafka indexer (existing stub may remain but orchestrator does not call `search_messages` by default)
- 6d admin ops deepen, 6e bot/digest deepen
- HTTP tool clients to core/chat
- Adding `dueAt` (separate schema change if needed later)
- Prompt caching / full Anthropic token streaming polish beyond basic SSE events

## Architecture

```
Client → api-gateway (/ai/*) → ai-service
  → rate limit (per-min + daily token budget)
  → ai_sessions (create/reuse)
  → orchestrator (max AI_MAX_TOOL_ROUNDS=8, timeout AI_CHAT_TIMEOUT_MS)
       ├─ MockPlanner | AnthropicProvider
       ├─ tools/* (Prisma, read-only)
       └─ link-resolver (existence + membership)
  → SSE or JSON response
  → ai_audit (via: "ai-assistant")
```

### Hard rules

- Read-only tools only.
- Every link in the response must pass link-resolver; failures are dropped silently from `links[]`.
- Audit payload includes `actor.via = "ai-assistant"` (or equivalent `via` field).
- Cross-group leakage forbidden: tools filter by ACTIVE membership; resolver re-checks.

## Components

### Tool registry (read-only)

| Tool | Behavior |
|------|----------|
| `list_my_tasks` | Tasks where user is ACTIVE/DONE assignee in ACTIVE member groups; prefer open statuses for “đang mở” |
| `search_tasks` | Keyword / status filter within allowed groups |
| `get_task` | Single task if membership |
| `get_group` | Group metadata if membership |
| `list_members` | ACTIVE members of allowed group |
| `workload_summary` | Counts by status / open assignees for the user (no due-date filter) |
| `get_report_link` | `{ available: false }` until a report entity exists |
| `sync_status` | Recent SyncJob / Google link status for user; never expose OAuth tokens |

### Link resolver

Input: `{ type, id }` (and optional code/groupId from tool rows).

URL templates (`APP_PUBLIC_URL`):

| Type | Href |
|------|------|
| task | `/groups/{groupId}/tasks/{code}` |
| group | `/groups/{id}` |
| conversation | `/conversations/{id}` only if user is conversation member |

Unresolved → omit from response.

### Orchestrator

1. Validate message; create or load `ai_sessions` owned by user.
2. Loop ≤ 8: choose tool(s) → execute → feed results back.
3. Build answer text from tool results (mock template or model final message).
4. Resolve all candidate entity refs → `links[]`.
5. Write `ai_audit` (`kind: "chat"`, tools, linkCount, mock, usage estimate).

**MockPlanner:** Vietnamese/English heuristics (open tasks → `list_my_tasks` / `workload_summary`; group/members → `get_group` / `list_members`; sync/google → `sync_status`; explicit task id/code → `get_task`).

**AnthropicProvider:** tool-use schemas matching registry; fixed system prompt (read-only, no fabricated links, only tool results). Model id via env (e.g. `AI_ANTHROPIC_MODEL`). On provider error: one MockPlanner fallback; response still usable with `mock: true`.

## API

### `POST /ai/chat`

Auth: JWT user. Body: `{ message, sessionId? }`.

Response:

```json
{
  "sessionId": "uuid",
  "answer": "string",
  "links": [{ "type": "task", "id": "uuid", "href": "https://...", "label": "..." }],
  "toolsUsed": ["list_my_tasks"],
  "mock": true,
  "usage": { "promptTokens": 0, "completionTokens": 0 }
}
```

### `POST /ai/chat/stream`

Same auth/body. SSE events in order: `meta` → `token` → `links` → `done` (or `error`).

Gateway: existing `/ai/*` proxy; additive fields only.

## Limits & errors

| Env | Default | Effect |
|-----|---------|--------|
| `AI_MAX_TOOL_ROUNDS` | 8 | Cap tool loop |
| `AI_CHAT_TIMEOUT_MS` | 30000 | Request timeout |
| `AI_RATE_LIMIT_PER_MIN` | 10 | 429 |
| `AI_TOKEN_BUDGET_PER_DAY` | 200000 | 429 `AI_BUDGET` (mock counts 0 tokens) |

Errors: 400 validation; 404 session not owned; 429 rate/budget; timeout → dedicated AI timeout error; Anthropic fail → fallback then success with `mock: true` when fallback works.

Middleware lives in `ai-service` (pattern similar to chat rate-limit).

## Testing

- Unit: link-resolver member vs non-member; planner tool selection; no cross-group links.
- Light integration: chat returns only in-membership task links; exceed rate → 429.
- CI must not require live `ANTHROPIC_API_KEY`.

## Acceptance (adjusted)

1. “Việc nào của tôi đang mở? Cho link” → open tasks + working app links.
2. User A cannot see group B data/links without membership.
3. 100% of returned `links` passed resolver.

## Files (expected)

- `backend/apps/ai-service/src/modules/ai/`: `tools/`, `link-resolver.ts`, `orchestrator.ts`, `providers/mock.ts`, `providers/anthropic.ts`, `rate-limit.ts`; refactor `ai.service.ts` / controller
- `backend/apps/ai-service/README.md`
- `backend/docs/runbooks/phase-6a-deepen.md`
- No required DB migration for this deepen

## Follow-ups (explicitly later)

- Task `dueAt` + overdue queries
- Real report entities + `get_report_link`
- HTTP tools with user JWT + `via=ai`
- Session message transcript / multi-turn context
- 6b / 6c / 6d / 6e deepen
