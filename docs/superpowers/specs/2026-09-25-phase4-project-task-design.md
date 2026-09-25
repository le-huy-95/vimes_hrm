# Phase 4 Design — Project / Task + GitHub `#task-<id>` link

**Date:** 2026-09-25  
**Status:** Implemented  
**Depends on:** Phase 1 (teams/RBAC), Phase 3 (GitHub webhook worker)  
**Scope choice:** **A** — API only (no web UI); no file attachments (Phase 5)  
**Approach:** Extend existing `github-webhook` worker (no new queue)

---

## 1. Goals & non-goals

### Goals

- CRUD `projects` scoped to a team.
- CRUD `tasks` scoped to a project; text `task_comments`.
- On GitHub `issues` / `pull_request` webhooks: if title contains `#task-<cuid>`, update that task’s `github_issue_url` and status:
  - Issue/PR **opened** (or reopened) → `in_progress`
  - PR **merged** or Issue **closed** → `done`
- Only update if the task’s project.team has a `github_connections` row for the webhook `installation_id`.
- MVC + OpenAPI; seed new RBAC keys.

### Non-goals

- Web UI for projects/tasks.
- Creating GitHub Issues/PRs from the app.
- `task_attachments` / MinIO (Phase 5).
- Dashboard aggregation (Phase 7).

---

## 2. Permissions

| Key | lead | member | viewer |
|-----|------|--------|--------|
| `team:view` | ✓ | ✓ | ✓ |
| `team:manage` | ✓ | | |
| `task:write` | ✓ | ✓ | |

- **Projects:** read `team:view`; create/update/archive `team:manage`.
- **Tasks + comments:** read `team:view`; create/update/delete `task:write`.

---

## 3. Data model

### `projects`

| Column | Notes |
|--------|--------|
| `id` | cuid |
| `team_id` | FK teams CASCADE |
| `name` | |
| `status` | `active` \| `archived` |
| `created_at`, `updated_at` | |

Index `(team_id)`.

### `tasks`

| Column | Notes |
|--------|--------|
| `id` | cuid — used in `#task-<id>` |
| `project_id` | FK projects CASCADE |
| `title`, `description?` | |
| `assignee_id?` | FK users SET NULL |
| `status` | `todo` \| `in_progress` \| `done` \| `cancelled` |
| `priority` | `low` \| `medium` \| `high` default `medium` |
| `github_issue_url?` | |
| `due_date?` | DateTime? |
| `created_at`, `updated_at` | |

Indexes: `(project_id)`, `(status)`.

### `task_comments`

| Column | Notes |
|--------|--------|
| `id` | cuid |
| `task_id` | FK CASCADE |
| `user_id` | FK users |
| `content` | text |
| `created_at` | |

No edit/delete beyond soft YAGNI: allow delete by author or `team:manage` in Phase 4.

---

## 4. HTTP API

| Method | Path | Auth |
|--------|------|------|
| GET/POST | `/teams/:teamId/projects` | view / manage |
| GET/PATCH/DELETE | `/teams/:teamId/projects/:projectId` | view / manage / manage |
| GET/POST | `/teams/:teamId/projects/:projectId/tasks` | view / task:write |
| GET/PATCH/DELETE | `/teams/:teamId/tasks/:taskId` | view / task:write |
| GET/POST | `/teams/:teamId/tasks/:taskId/comments` | view / task:write |
| DELETE | `/teams/:teamId/tasks/:taskId/comments/:commentId` | task:write (author) or manage |

DELETE project: reject if has tasks **or** cascade delete tasks+comments — **Phase 4: CASCADE** delete tasks/comments with project.

Assignee must be a user in the same org (and preferably team member — enforce team member).

---

## 5. GitHub link (webhook extension)

In `GithubWebhookService.processJob`, after activity recording for `issues` / `pull_request`:

1. Extract title from `issue.title` or `pull_request.title`.
2. Regex `/#task-([a-z0-9]+)/i` → taskId.
3. Load task → project → teamId; load connection by installationId; require `connection.teamId === task.project.teamId`.
4. Set `github_issue_url` from `html_url`.
5. Status map:
   - `opened` | `reopened` → `in_progress` (skip if already `done`/`cancelled`? **Phase 4: always apply map except never overwrite `cancelled`**)
   - `closed` on issues → `done`
   - `closed` on PR with `merged: true` → `done`; `closed` unmerged → leave status (or `todo`) — **Phase 4: only merged → done; unmerged close → no status change**
6. No-op if task not found or team mismatch (log + continue).

Parse helper: `src/lib/task-ref.ts` + unit tests.

---

## 6. Code layout

```
src/lib/task-ref.ts
src/repositories/project.repository.ts
src/repositories/task.repository.ts
src/services/project.service.ts
src/services/task.service.ts
src/controllers/project.controller.ts
src/controllers/task.controller.ts
src/validators/project.validators.ts
src/validators/task.validators.ts
src/routes/projects.routes.ts   # mounted under teams
# extend github-webhook.service.ts
# seed + schema + openapi
```

---

## 7. Decisions log

| Decision | Choice |
|----------|--------|
| Scope | A — API only |
| Approach | Extend github-webhook worker |
| Task ref | Full cuid `#task-<cuid>` |
| Status map | opened→in_progress; merged/issue closed→done |
| Team guard | installation must match task’s team |
| Attachments | Deferred Phase 5 |
| Project delete | CASCADE tasks |

---

*End of Phase 4 design.*
