# Phase 7 Design — Team Dashboard Aggregation

**Date:** 2026-09-25  
**Status:** Approved; implementing  
**Depends on:** Phases 1–6 (teams, tasks, github activity, chat)  
**Scope:** **A** — API only `GET /teams/:teamId/dashboard` + Redis TTL cache 60s. No UI, no materialized view.

---

## 1. Goals

- Single endpoint aggregating team snapshot:
  - `members`: count by role (lead/member/viewer) + total
  - `tasks`: counts by status (todo/in_progress/done/cancelled) across team projects
  - `github`: connection present?, repo count, last N activity events (default 10)
  - `chat`: last N messages from default team channel (default 10)
- Redis cache key `team:{teamId}:dashboard` TTL 60s
- Auth: `team:view`
- MVC + OpenAPI

## 2. Non-goals

- Web dashboard UI
- Materialized view / refresh job (Phase 7 later / ops)
- Cross-team org-wide dashboard
- Live Socket.IO push of dashboard (poll/cache enough)

## 3. Response shape

```json
{
  "teamId": "...",
  "members": { "total": 5, "byRole": { "lead": 1, "member": 3, "viewer": 1 } },
  "tasks": { "todo": 2, "in_progress": 1, "done": 4, "cancelled": 0 },
  "github": {
    "connected": true,
    "repoCount": 3,
    "recentActivity": [ /* GithubActivityEvent summaries */ ]
  },
  "chat": {
    "channelId": "...",
    "recentMessages": [ /* Message summaries */ ]
  },
  "cached": false
}
```

## 4. Implementation notes

- Parallel Prisma queries (`Promise.all`)
- On cache hit return parsed JSON with `cached: true`
- Optional query `?refresh=1` to bypass cache
- Ensure team channel exists before reading messages (reuse ChatService.listChannels / channel ensure)

## 5. Code layout

```
src/services/dashboard.service.ts
src/controllers/dashboard.controller.ts
src/routes/teams.routes.ts  # GET /:teamId/dashboard
src/container.ts
openapi/openapi.yaml
```

---

*End of Phase 7 design.*
