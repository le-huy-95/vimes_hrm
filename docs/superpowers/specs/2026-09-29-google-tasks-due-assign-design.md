# Google Tasks due date + assignee UX

**Date:** 2026-09-29  
**Status:** Approved (brainstorming)  
**Approach:** (1) Thin vertical slice — `dueDate` on task + Flutter chips/picker on existing Board/List; reuse claim/assign APIs  
**Scope:** Backend (`core-service` + `google-sync-service`) and Flutter tasks tab. Date-only due synced both ways with Google Tasks; multi-assignee from group members; create leaves task in pool (no assignee).

## 1. Goals

1. Add **hạn chót** (due date, date-only) on group tasks, editable in Flutter, synced **two-way** with Google Tasks `due`.
2. Make **gán người** usable: pick members from the current group (multi), plus existing **claim**.
3. **Create task** defaults to **no assignees** (pool): others claim, or creator assigns later.
4. Only ACTIVE assignees get a personal Google Tasks projection (existing link model).

## 2. Non-goals

- Start/end time range (app-only or notes encoding).
- Subtasks, starred list, Drive attachments on Google Task, multiple Google tasklists.
- Google-Tasks-like full detail bottom sheet (polish later).
- Unassign / remove assignee API (add later if needed).
- Per-assignee due dates.
- Changing Google Tasks API capabilities Google does not expose (true assignee field).

## 3. Decisions (from brainstorming)

| Topic | Choice |
|-------|--------|
| Priority features | Due date + assignee first |
| Due shape | **A** — date only; bidirectional via Google `due` |
| Assignee UX | **A** — multi-select from group members; assign at create optional |
| Create default | **Pool** — no assignee; claim or assign later |
| Implementation | **1** — thin vertical slice (not full Google-like sheet) |

## 4. Current gaps

| Area | Today | Target |
|------|--------|--------|
| Schema | No `due_date` on microservice `tasks` | `tasks.due_date` DATE NULL |
| Sync payload | title, notes, status | + `due` |
| Sync pull | completion, title, personal notes | + merge `due` → `due_date` |
| Create | Auto-assigns creator; status `IN_PROGRESS` | No auto-assign; status `TODO` |
| Flutter assign | Prompt raw `userId` | Member multi-select |
| Flutter due | None | Today / Tomorrow / picker / clear |
| Calendar | Uses `createdAt` (or similar) | Group by `dueDate`; undated omit from day cells |

## 5. Data model

```
tasks.due_date  DATE NULL   -- calendar date only; API "YYYY-MM-DD"
```

- Store as date (no time-of-day). Display in user’s local calendar.
- Google push: RFC 3339 date at midnight UTC for that calendar day (same convention Tasks API uses for date-only dues).
- Clear due: `dueDate: null` → omit/clear Google `due` on next push.

`task_assignees` unchanged (multi ACTIVE/DONE/REMOVED).

## 6. API

### 6.1 PATCH task

`PATCH /groups/:groupId/tasks/:code`

Body (all optional):

```json
{
  "title": "string",
  "description": "string | null",
  "dueDate": "YYYY-MM-DD | null"
}
```

- Auth: group member.
- `INVALID_DUE_DATE` if present and not `YYYY-MM-DD`.
- Bump `version`, emit `TaskUpdated` (or field-specific event), enqueue Google push for each ACTIVE assignee with updated fields including `due`.

### 6.2 Create / claim / assign

- `POST .../tasks` — default `assigneeIds: []`, `allowClaim: true`, status **`TODO`**. Do **not** force-add creator as assignee.
- Task chat thread (`ensure-task`): still pass **creator** in `memberIds` even when not an assignee, so the thread is not empty; assignees are added when claimed/assigned (existing ensure behavior or follow-up if missing).
- `POST .../claim` — unchanged; after success enqueue `TASKS_PUSH` for claimer (include `due` if set).
- `POST .../assign` `{ userId }` — target must be group member (`NOT_GROUP_MEMBER`); enqueue push for target. Multi-assign = repeated calls or batch later; Flutter may call once per selected member.

### 6.3 List/get response

Include `dueDate: "YYYY-MM-DD" | null` on task DTOs.

## 7. Google sync

### 7.1 Push (`TASKS_PUSH`)

Extend `TaskPushPayload`:

```ts
{ title, notes, status, due?: string | null } // due = YYYY-MM-DD or null to clear
```

- Partial PATCH: include `due` in `diffPushFields` / `buildFieldHashes`.
- Map to Tasks API `due` (date-only midnight) or clear when null.
- Still skip users without ACTIVE assignee / without Google token (`AUTH_REQUIRED` as today).

### 7.2 Pull (`TASKS_PULL`)

- Request `due` in `fields`.
- Merge into `tasks.due_date` when Google wins: same **local-wins if `task.updatedAt` newer** rule as title.
- Who may apply due from Google: prefer **any pull that finds a linked task**; write shared `tasks.due_date` (one due per task). Anti-echo via field hashes / local-wins.

### 7.3 Pool semantics

- No ACTIVE assignees → no Google link created.
- First claim/assign → insert Google task with title/notes/status/due.
- Detach-on-unassign: **out of scope** (no unassign this slice).

## 8. Flutter UI

Attach to existing Board/List cards (no new detail route required).

1. **Due chips:** Hôm nay / Ngày mai / date picker / clear (when set). Calls PATCH.
2. **Assignees:**  
   - Empty → label “Chưa gán” + **Claim** + **Gán** (dialog: multi-select group members via existing members API).  
   - Non-empty → avatar/name chips + add.  
3. **Create dialog:** title required; optional due; no assignee required.
4. **Calendar:** tasks with `dueDate` on that day; tasks without due excluded from day buckets.
5. Replace raw `userId` assign prompt.

Bloc: add events for due update and multi-assign; reuse refresh after success.

## 9. Errors

| Code | When |
|------|------|
| `INVALID_DUE_DATE` | Bad due format |
| `NOT_GROUP_MEMBER` | Assign target not in group |
| Existing | `CLAIM_DISABLED`, claim full / `ASSIGN_FULL`, `NOT_ASSIGNEE` |
| Sync | `AUTH_REQUIRED` on link/job — app mutations still succeed |

## 10. Testing

- Unit/integration: PATCH due → push payload contains `due`; pull updates DB when Google newer; create with empty assignees enqueues **no** push; claim/assign enqueues push with due.
- Flutter: due chip + member picker smoke against repository methods (follow existing tasks bloc test patterns if present).

## 11. Implementation order

1. Prisma migration `due_date` + DTO/list/get.
2. PATCH task + change create defaults (no auto-assign, `TODO`).
3. Extend push/pull `due`.
4. Flutter models + repository + bloc + UI chips/picker/calendar.
5. Tests above.

## 12. Follow-ups (explicitly later)

Subtasks, star, Drive links, multi tasklist, start/end times, unassign, Google-like detail sheet.
