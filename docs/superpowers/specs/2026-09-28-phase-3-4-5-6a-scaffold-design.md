# Design: Scaffold Phase 3 / 4 / 5 / 6a

**Date:** 2026-09-28  
**Status:** Approved (chat option A)  
**Parent:** [v2.5](./2026-09-28-ke-hoach-trien-khai-v2.5-design.md)

## Scope (scaffold, runnable stubs)

### Phase 3 — Google Chat spike
- ADR documenting unanswered spike questions + interim decisions
- `google-sync-service` (or dedicated routes): `POST /internal/google-chat/events` stub — verify shared token, dedupe by event id, optional complete-task card action → core with `completed_source=CHAT`
- Email fallback: reuse worker templates note only (no new channel)

### Phase 4 — Sheets
- Migration: `group_sheets`, job types `SHEETS_PUSH` / `SHEETS_PULL`
- Enqueue + worker handlers that log / mark DONE (no real Sheets API until OAuth scopes ready)

### Phase 5 — Hardening stubs
- `GET /metrics` on gateway (prometheus text minimal: up, proxy counters optional)
- Internal `POST /internal/dlq/replay` stub on worker
- Runbook markdown under `backend/docs/runbooks/`

### Phase 6a — AI read-only
- Orchestrator loop max 8 tools; mock LLM if no `ANTHROPIC_API_KEY`
- Tools: list_my_tasks, get_task, get_group, sync_status (HTTP to core/identity with user JWT)
- Link resolver for task/group/conversation
- `POST /ai/chat` + SSE `POST /ai/chat/stream` stub
- Tables `ai_sessions` / `ai_audit` minimal (optional JSON log if skip heavy migration)

## Out of scope
- 3.5 bridge, 6b write tools, 6c pgvector, real ClamAV, FCM

## Acceptance
- Health + new routes respond; ADR present; AI returns links structure without leaking cross-group data in tool filters
