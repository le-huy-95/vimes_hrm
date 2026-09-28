# Deepen Phase 6a — AI read-only + links

**Date:** 2026-09-28  
**Spec:** `docs/superpowers/specs/2026-09-28-phase-6a-deepen-design.md`  
**Plan:** `docs/superpowers/plans/2026-09-28-phase-6a-deepen.md`

## What shipped

| Piece | Detail |
|-------|--------|
| Tools | `list_my_tasks`, `search_tasks`, `get_task`, `get_group`, `list_members`, `workload_summary`, `get_report_link` (unavailable), `sync_status` |
| Link resolver | Membership / conversation check; drop invalid |
| Providers | MockPlanner; Anthropic; OpenAI-compatible (Codex via `OPENAI_*`) |
| Limits | Per-min + daily token budget in `ai-service` |
| Audit | `ai_audit` with `via: "ai-assistant"`, `provider`, `mock` |

**Not in 6a:** due dates, write tools (6b), semantic search as default (6c), admin deepen (6d), bot deepen (6e).

## Acceptance

1. “Việc nào của tôi đang mở? Cho link” → open tasks + app links (mock OK).
2. Cross-group: no membership → no data/links for that group.
3. Every `links[]` entry passed resolver.

## Operator

```bash
# Mock (default)
unset ANTHROPIC_API_KEY OPENAI_API_KEY

# OpenAI / Codex
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
AI_OPENAI_MODEL=gpt-4.1

# Anthropic
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
```

## Tests

```bash
cd backend && bun --filter @manage-teams/ai-service test
cd backend && bun --filter @manage-teams/ai-service typecheck
```

CI must not require live LLM keys.
