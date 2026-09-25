# Team Dashboard UI + Google Tasks — Implementation Plan

> **For agentic workers:** Execute task-by-task. Layers ship independently. Checkboxes track progress.

**Goal:** Deliver team sidebar (3 sections), TeamPage `⋮` menu + dashboard (Tasks bar chart + Google/GitHub cards), then member/commit panels, then real Google Tasks sync.

**Architecture:** Phased UI-first on existing MVC API; extend dashboard + new integrations/Tasks endpoints; BullMQ sync mirrors Workspace/GitHub patterns.

**Tech Stack:** React + Vite (`web/`), Express/Prisma API, Redis/BullMQ, Google Tasks API.

**Spec:** `docs/superpowers/specs/2026-09-25-team-dashboard-ui-google-tasks-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `web/src/pages/AppLayout.tsx` | Sidebar: Nhóm / Google / GitHub + teams modal |
| `web/src/pages/TeamPage.tsx` | Header menu, drawers, dashboard shell |
| `web/src/components/TeamsModal.tsx` | Modal list/tree of teams |
| `web/src/components/TasksBarChart.tsx` | Todo/Doing/Done bars |
| `web/src/styles/app.css` | Modal, menu, chart, drawer styles |
| `web/src/api/client.ts` | Types for dashboard/integrations |
| Later: Prisma models, `google-tasks` service/worker, routes | Layer 3 |

---

### Task 1: Layer 1 — Sidebar + Teams modal

**Files:** Create `web/src/components/TeamsModal.tsx`; Modify `AppLayout.tsx`, `app.css`

- [x] Replace team tree with button **Nhóm của bạn** opening modal
- [x] Modal shows flat/tree teams; click → navigate + close
- [x] Sections **Google** and **GitHub** list services; “đã liên kết” only when `linked: true` (Layer 1: fetch `/integrations` if exists, else all false)
- [x] Keep Tạo nhóm, brand, logout

### Task 2: Layer 1 — TeamPage `⋮` + personnel/add drawers + dashboard shell

**Files:** Modify `TeamPage.tsx`; Create `TasksBarChart.tsx`; CSS

- [x] Header: title + `⋮` menu (Quản lý nhân sự / Thêm người / Xóa)
- [x] Move member table + invite into panels opened from menu
- [x] Dashboard: TasksBarChart + Google | GitHub cards
- [x] Edit details for lead under `<details>`


### Task 3: Layer 2 — Integrations + commits APIs + wire panels

- [x] `GET /teams/:id/integrations`
- [x] `GET /teams/:id/members/integrations`
- [x] `GET /teams/:id/members/:userId/github-commits`
- [x] Optional `TeamMember.githubLogin`
- [x] Wire sidebar linked flags + GitHub commits drawer

### Task 4: Layer 3 — Google Tasks sync + real chart

- [ ] Prisma `team_google_tasks_settings` + `google_tasks`
- [ ] OAuth Tasks + BullMQ worker + bind lists APIs
- [ ] Extend dashboard `googleTasks` counts; chart uses real data

---

## Execution note

Start with Tasks 1–2 (Layer 1 UI) in this session. Tasks 3–4 follow after Layer 1 works.

---

*End of plan.*
