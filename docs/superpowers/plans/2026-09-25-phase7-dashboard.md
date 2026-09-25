# Phase 7 Team Dashboard — Implementation Plan

> Implement on branch `feature/phase7-dashboard` in a worktree; merge to master when green.

**Goal:** `GET /teams/:teamId/dashboard` with Redis TTL 60s cache.

**Spec:** `docs/superpowers/specs/2026-09-25-phase7-dashboard-design.md`

### Task 1: DashboardService + controller + route

- Aggregate members/tasks/github/chat via Promise.all
- Cache get/set redis `team:{teamId}:dashboard` EX 60
- `?refresh=1` skip cache
- Wire DI + `requireTeamPermission("team:view")`
- Commit: `feat(dashboard): add team dashboard aggregation API`

### Task 2: OpenAPI + mark spec Implemented

- Document endpoint
- `npm test && npx tsc --noEmit`
- Commit: `docs(dashboard): document Phase 7 dashboard endpoint`

---

*End of Phase 7 plan.*
