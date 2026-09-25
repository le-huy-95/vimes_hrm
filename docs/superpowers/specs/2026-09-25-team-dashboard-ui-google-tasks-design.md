# Design — Team Dashboard UI + Google Tasks Sync

**Date:** 2026-09-25  
**Status:** Approved (brainstorm)  
**Depends on:** Phase 1 (teams/RBAC), Phase 2 (Workspace sync patterns), Phase 3 (GitHub App + activity), Phase 7 (dashboard API)  
**Approach:** Phased delivery (3 layers) — UI shell → service member panels → Google Tasks sync + real chart  
**Primary surfaces:** `web/` AppLayout + TeamPage; API under `/teams/:teamId/…`

---

## 1. Goals

- **Team page header:** team title with a trailing `⋮` icon; menu opens only on click.
- **Menu items (lead):** Quản lý nhân sự, Thêm người vào nhóm, Xóa nhóm. Members/viewers see a reduced set (no manage/delete).
- **Default team view:** dashboard — Google Tasks progress as a **bar chart** (Todo / Doing / Done), plus Google and GitHub service cards.
- **Service cards:** click → list of **app team members** with link status; GitHub linked member → detail panel with **paginated commits**.
- **Left sidebar:** three sections — Nhóm của bạn (modal of all teams), Google services (with “đã liên kết” only when linked), GitHub (same rule).
- **Google Tasks:** real sync (OAuth + DB + BullMQ) feeding the chart — **not** internal app tasks.

## 2. Non-goals

- Using internal Project/Task counts for the progress chart.
- Listing full Google Directory / GitHub org membership in service panels.
- Drive / Gmail (unless added later).
- Putting “Sửa thông tin nhóm” or “Cài đặt liên kết” in the `⋮` menu (out of menu scope).
- Live Socket.IO push for dashboard (poll / cache enough).

---

## 3. UX

### 3.1 Sidebar (`AppLayout`)

| Mục | Hành vi |
|-----|---------|
| **Nhóm của bạn** | Click → modal listing all teams (tree if nested). Click a team → close modal + navigate to `/teams/:id`. |
| **Google** | Always list services: Đăng nhập Google, Google Tasks, Workspace Directory, Google Chat. If linked → small green line “đã liên kết” under the name; if not → name only. |
| **GitHub** | List: GitHub App, Repos nhóm. Same linked / not-linked display rule. Status for team-scoped links reflects the **currently selected team**. |

Remove always-visible team tree + member name lists from the sidebar (replaced by modal + service panels).

Keep: brand, org name, “Tạo nhóm”, user footer / logout.

### 3.2 Team page header + `⋮`

- Title row: `{team.name}` … `⋮` (right-aligned).
- Dropdown closes on outside click / Escape.
- **Quản lý nhân sự** → drawer/panel: member table, role change, remove (existing APIs).
- **Thêm người vào nhóm** → dialog: email + role invite (existing APIs).
- **Xóa nhóm** → confirm → DELETE team (existing API).
- Optional: keep edit name/description elsewhere; not in this menu.

### 3.3 Dashboard body

1. **Tiến độ Google Tasks** — bar chart Todo / Doing / Done from synced Google Tasks only.  
   - Empty: CTA to connect / bind task lists.  
   - Show list name(s) + last synced time when available.
2. **Cards:** Google | GitHub (side-by-side desktop; stacked mobile) with summary counts + “Xem thành viên”.

### 3.4 Service member panel + commits

- Source list = team members in Manage Teams.
- **Google:** show Google/Workspace link status (email / `googleUserId`); no commits.
- **GitHub:** show `@login` when mapped; unlinked members cannot open commit detail.
- **Commits (GitHub):** click linked member → detail panel/page; paginate events from `github_activity_events` filtered by team + `actorLogin` (push/commit-like); link out via `externalUrl` when present.
- UI: overlay drawer preferred; optional query `?service=github&user=…`.

---

## 4. Data & backend

### 4.1 Google Tasks (new)

**Auth:** OAuth with Tasks scopes; store tokens in `oauth_connections` (provider e.g. `google_tasks`). Lead connects per org/user as needed to sync team lists.

**Tables (proposed):**

`team_google_tasks_settings`

| Column | Purpose |
|--------|---------|
| `team_id` | PK/FK |
| `todo_list_id` | Google task list id (optional) |
| `doing_list_id` | optional |
| `done_list_id` | optional |
| `last_synced_at` | |
| `connected_by_user_id` | nullable |
| timestamps | |

`google_tasks`

| Column | Purpose |
|--------|---------|
| `id` | cuid |
| `team_id` | FK |
| `google_task_id` | external id |
| `list_kind` | `todo` \| `doing` \| `done` |
| `title` | |
| `status` | raw Google status |
| `google_updated_at` | |
| unique `(team_id, google_task_id)` | |

**Chart mapping:**

- Prefer counts by `list_kind` when 1–3 lists are bound.
- If only one list bound: `needsAction` → Todo, `completed` → Done, Doing = 0.

**Jobs:** BullMQ worker + per-team lock; manual sync API; periodic sync optional.

### 4.2 Dashboard API (extend Phase 7)

`GET /teams/:teamId/dashboard` adds:

```json
"googleTasks": {
  "connected": true,
  "todo": 6,
  "doing": 5,
  "done": 9,
  "lastSyncedAt": "...",
  "lists": { "todo": "...", "doing": "...", "done": "..." }
}
```

Do **not** use internal `tasks` status counts for this UI chart (field may remain for other consumers but UI ignores it for progress).

### 4.3 New / supporting APIs

| Endpoint | Purpose |
|----------|---------|
| `GET /teams/:teamId/integrations` | Sidebar + card badges: google login, tasks, workspace, gchat, github app, repos linked? |
| `GET /teams/:teamId/members/integrations?service=google\|github` | Members + link flags + handles |
| `GET /teams/:teamId/members/:userId/github-commits?cursor=` | Paginated commit-like activity for mapped login |
| `POST/GET/PATCH … /teams/:teamId/google-tasks/…` | Connect status, list bind, trigger sync (lead, `team:manage`) |

RBAC: view endpoints need `team:view`; mutate Tasks settings / invite / delete need existing lead permissions.

### 4.4 GitHub commit attribution

- There is no `User.githubLogin` column today. Layer 2 adds optional `TeamMember.githubLogin` (or equivalent) so a lead can set the handle used for activity matching. Until set → “chưa liên kết”, commits panel disabled.
- Query `GithubActivityEvent` where `teamId` + `actorLogin` match; prefer push-related `eventType`; return title, occurredAt, externalUrl, repo name if joinable.

---

## 5. Implementation layers (delivery order)

1. **UI shell:** Sidebar 3 sections + teams modal; TeamPage `⋮` + personnel/add/delete flows; dashboard layout with empty/mock-safe chart placeholder calling dashboard when ready.
2. **Services UX:** Integration status API; member integration panels; GitHub commits panel wired to activity.
3. **Google Tasks:** schema + OAuth + worker + bind lists + real bar chart data.

Each layer is separately reviewable / shippable.

---

## 6. Web structure (guidance)

```
web/src/pages/AppLayout.tsx          # sidebar rewrite
web/src/pages/TeamPage.tsx           # header menu + dashboard
web/src/components/…                 # TeamsModal, TeamMenu, TasksBarChart,
                                     # ServiceCard, MemberIntegrationPanel, CommitsPanel
```

Reuse existing `api` client; follow current CSS patterns in `web/src/styles/app.css` (no unrelated redesign).

---

## 7. Testing (minimum)

- Unit/service: Tasks status aggregation (1-list vs 3-list mapping).
- API: integrations payload; commits pagination filter by actor.
- Smoke: TeamPage renders chart empty state; menu opens/closes; teams modal navigates.

---

## 8. Resolved decisions (brainstorm)

| Topic | Decision |
|-------|----------|
| Menu placement | Icon at end of team title line |
| Menu items | Personnel, Add member, Delete team |
| Service members | App members + link status |
| Commits UX | Click person → detail panel with pagination |
| Progress source | Google Tasks only, bar chart |
| Sync scope | Full API + DB + real chart (not mock-only) |
| Delivery | 3-layer approach |
| Sidebar | Teams modal + Google list + GitHub list |

---

*End of design.*
