# Task board free drag-and-drop (3 columns)

**Date:** 2026-09-29  
**Status:** Approved (brainstorming)  
**Approach:** Keep Todo / In progress / Done columns; allow drag to any column; extend PATCH task with `status` (or dedicated move) so reopen works; Google Sheets/Tasks mapping unchanged (Done ↔ completed, else needsAction).  
**Scope:** `core-service` task module + Flutter tasks board (`TasksBloc` / `_BoardView`). No schema migration.

## 1. Goals

1. Board keeps **3 columns**: Todo (`TODO`), In progress (`IN_PROGRESS`), Done (`DONE`).
2. User can **long-press drag** a card onto **any** other column to change status.
3. Support **reopen** (Done → In progress / Todo) and **skip** (Todo → Done) via one status-move path.
4. `IN_PROGRESS` remains **app-only**; Google Tasks/Sheets continue Todo↔Done semantics as today.

## 2. Non-goals

- Collapsing board to 2 columns.
- Reordering cards within a column (position/rank).
- Changing Google Tasks to expose a third status.
- Unassign-all UX beyond what reopen needs for status consistency.
- Redesigning List / Calendar views (buttons may keep claim/complete shortcuts).

## 3. Decisions (from brainstorming)

| Topic | Choice |
|-------|--------|
| Columns | Keep all 3 (Todo, In progress, Done) |
| Drag model | **Free** — any column ↔ any column |
| Google | Unchanged: Done → completed; else → needsAction |
| Implementation | Extend task status update API + Flutter `_onDrag` |

## 4. Current gaps

| Area | Today | Target |
|------|--------|--------|
| Board UI | 3 columns + `LongPressDraggable` / `DragTarget` | Same UI; accept any drop target status |
| `TasksBloc._onDrag` | Only `TODO→IN_PROGRESS` (claim) and `IN_PROGRESS→DONE` (complete) | Map any `from→to` via status move API |
| PATCH task | title / description / dueDate only | Also optional `status` |
| Reopen | No API | Done → ACTIVE assignees + task status Todo or In progress |

## 5. Status transition rules

Single helper `moveTaskStatus(groupId, code, userId, toStatus)` used by PATCH (and optionally reused by claim/complete later).

| Target | Behavior |
|--------|----------|
| `IN_PROGRESS` | Ensure current user is an ACTIVE assignee (claim/reactivate if needed, respect `allow_claim` / `max_assignees`); set task `status = IN_PROGRESS`. |
| `DONE` | Ensure current user can complete: if not ACTIVE assignee, auto-claim first when claim allowed; then mark assignee DONE and apply existing completionMode rules for task-level `DONE`. |
| `TODO` | Set task `status = TODO`. Reactivate this user's assignee if they were DONE (`ACTIVE`, clear `completedAt`); do not invent assignees if none exist. |

Same-status drop: no-op (UI already ignores).

Emit appropriate events (`TaskClaimed` / `TaskCompleted` / `TaskUpdated` or a dedicated `TaskStatusMoved`) and bump `version`. Enqueue Google push for affected ACTIVE assignees with mapped status (DONE → completed, else needsAction).

### Auth / errors

- Group member required.
- `CLAIM_DISABLED` / `CLAIM_FULL` when move to `IN_PROGRESS` or `DONE` needs a new claim and claim is blocked.
- `NOT_ASSIGNEE` only when completing without ability to auto-claim (e.g. claim disabled and user not assignee).
- `INVALID_STATUS` if status not in `{TODO, IN_PROGRESS, DONE}`.

## 6. API

### 6.1 PATCH task — add `status`

`PATCH /groups/:groupId/tasks/:code`

```json
{
  "title": "string",
  "description": "string | null",
  "dueDate": "YYYY-MM-DD | null",
  "status": "TODO | IN_PROGRESS | DONE"
}
```

- All fields optional; at least one required (existing empty-patch rule).
- When `status` present, run transition rules above; other fields still update as today.
- Response: existing task payload including new `status`.

No new route required (prefer PATCH over a separate `/move` to stay DRY with current Flutter `patchTask`).

## 7. Flutter

### 7.1 Board

- Keep `_BoardView` columns `['TODO', 'IN_PROGRESS', 'DONE']`.
- Optional: Vietnamese labels in column headers (`Todo` / `Đang làm` / `Hoàn thành`) without changing status keys.
- `onWillAccept` / drop: always accept foreign status; same column ignored in bloc.

### 7.2 Bloc + repository

- `CoreRepository.patchTask(... { String? status })` sends `status` in body.
- `TasksDragRequested`: optimistic `copyWith(status: to)`; call `patchTask(..., status: to)`; refresh list; on failure rollback + snackbar.
- Remove hard-coded allow-list that rejects Done→Todo / Todo→Done.
- List view claim/complete shortcuts can keep calling claim/complete endpoints **or** switch to the same PATCH status path (prefer PATCH for one code path).

## 8. Google sync

- No change to sync handlers beyond receiving status via existing push after local move.
- Mapping remains: local `DONE` ↔ Google `completed`; `TODO` / `IN_PROGRESS` ↔ Google needsAction / not completed.
- Sheets mapping unchanged (Todo / Done only).

## 9. Error handling & UX

- Optimistic move; API error → restore previous task list + error snackbar.
- Drop on same column: silent no-op.
- Busy flag while request in flight (existing pattern).

## 10. Testing

- Unit/service: transitions Todo↔In progress↔Done including Done→Todo reopen and Todo→Done (auto-claim + complete).
- Bloc or widget smoke: drop updates optimistic status; failure rolls back.
- Manual: drag each direction on Flutter web board; confirm Google task completion flips only for Done.

## 11. Out of scope follow-ups

- Persist column order / rank.
- Permission: only assignee may move (stricter than group member).
- Dedicated `/move` endpoint if PATCH grows too overloaded.
