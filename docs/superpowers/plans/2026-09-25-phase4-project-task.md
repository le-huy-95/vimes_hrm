# Phase 4 Project/Task + GitHub Link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add team-scoped Projects/Tasks/Comments API and extend GitHub webhook to update tasks via `#task-<cuid>` in Issue/PR titles.

**Architecture:** New MVC modules for projects/tasks. Extend `GithubWebhookService` after activity recording. RBAC: `task:write` for lead+member; projects require `team:manage` for writes.

**Tech Stack:** Express, Prisma, Zod, Vitest. Reuse Phase 3 webhook pipeline.

**Spec:** `docs/superpowers/specs/2026-09-25-phase4-project-task-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `prisma/schema.prisma` | Project, Task, TaskComment + enums + relations |
| `prisma/seed.ts` | Add `task:write` for lead, member |
| `src/lib/task-ref.ts` | Parse `#task-<id>` |
| `src/lib/task-ref.test.ts` | Unit tests |
| `src/repositories/project.repository.ts` | |
| `src/repositories/task.repository.ts` | tasks + comments |
| `src/services/project.service.ts` | |
| `src/services/task.service.ts` | |
| `src/services/github-webhook.service.ts` | Call task link helper |
| `src/controllers/project.controller.ts` | |
| `src/controllers/task.controller.ts` | |
| `src/validators/*.ts` | Zod |
| `src/routes/teams.routes.ts` | Mount project/task routes |
| `src/container.ts` | Wire DI |
| `openapi/openapi.yaml` | Document endpoints |

---

### Task 1: Schema + seed

- [ ] Add enums `ProjectStatus`, `TaskStatus`, `TaskPriority`
- [ ] Add models Project, Task, TaskComment; Team/User relations
- [ ] `npx prisma migrate dev --name phase4_project_task`
- [ ] Seed `task:write` for lead + member
- [ ] Commit: `feat(tasks): add Project/Task schema and task:write permission`

### Task 2: task-ref parser (TDD)

- [ ] Test: extracts cuid from `#task-clxyz...`, case-insensitive; null if missing; first match wins
- [ ] Implement `extractTaskIdFromTitle(title: string): string | null`
- [ ] Commit: `feat(tasks): parse #task-<id> from GitHub titles`

### Task 3: Repositories + services + controllers + routes

- [ ] Project CRUD under `/teams/:teamId/projects`
- [ ] Task CRUD under `/teams/:teamId/projects/:projectId/tasks` and `/teams/:teamId/tasks/:taskId`
- [ ] Comments under `/teams/:teamId/tasks/:taskId/comments`
- [ ] Enforce org/team membership; assignee must be team member
- [ ] Wire container + routes with requireTeamPermission
- [ ] `tsc` + commit: `feat(tasks): add Project/Task HTTP API`

### Task 4: Webhook task linking

- [ ] Inject TaskRepository (or TaskService) into GithubWebhookService
- [ ] On issues/pull_request: extract id, verify installation team, update url+status per spec
- [ ] Unit test status mapping helper if extracted
- [ ] Commit: `feat(tasks): link GitHub Issue/PR webhooks to tasks`

### Task 5: OpenAPI + verify

- [ ] Document new paths
- [ ] `npm test && npx tsc --noEmit`
- [ ] Commit: `docs(openapi): document Phase 4 Project/Task endpoints`
- [ ] Mark spec Implemented

---

## Self-review

| Spec item | Task |
|-----------|------|
| Schema projects/tasks/comments | 1 |
| Permissions task:write | 1 |
| REST API | 3 |
| #task-cuid parse | 2 |
| Webhook status map + team guard | 4 |
| OpenAPI | 5 |
| No attachments / no UI | — |

---

*End of Phase 4 plan.*
