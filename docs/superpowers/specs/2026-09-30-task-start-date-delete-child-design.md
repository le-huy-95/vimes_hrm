# Task start date + delete child from parent

**Date:** 2026-09-30  
**Status:** Approved (brainstorming)  
**Approach:** (1) Mirror `dueDate` end-to-end for app-local `startDate`; inline delete on parent subtask list + keep delete in child dialog  
**Scope:** `core-service` schema/API/cache DTO; Flutter tasks detail dialog (edit) + board/list/calendar (display).  
**Out of scope:** Google Tasks sync for `startDate`; chat create-task form; AI tools; Sheets columns; start-date edit chips on List (edit only in detail dialog).

## 1. Goals

1. Add editable **ngày bắt đầu** (`startDate`, date-only) on tasks, edited next to hạn chót in the detail dialog; shown as a compact range (or start-only) on board, list, and calendar surfaces that currently show due.
2. Allow deleting a **subtask from inside the parent** detail dialog (inline delete), while keeping delete in the child detail dialog — without closing the parent dialog when a child is deleted.
3. Keep Google Tasks sync unchanged: Google `due` continues to map only to local `dueDate`. `startDate` is app-only (Google Tasks API has no separate start-date field).

## 2. Non-goals

- Syncing `startDate` to/from Google Tasks (no API field; do not overwrite `due`).
- Adding `startDate` to chat create-task, AI tool schemas, or Sheets sync in this change.
- Adding List-view start-date ActionChips (List keeps due chips only; start is edited in the detail dialog).
- Time-of-day on start/due.
- Changing delete permission rules (still creator or group ADMIN/OWNER).
- Nested delete UX beyond one-level subtasks already supported.

## 3. Decisions

| Topic | Choice |
|-------|--------|
| Start date model | New nullable `tasks.start_date` / API `startDate` (`YYYY-MM-DD`) |
| Google sync | **A** — app-only; do not push/pull `startDate` |
| Display surfaces | Dialog (editable) + board + list + calendar (display range / start) |
| Board / list format | **1** — `28 thg 9 → 5 thg 10` (show only the side that exists) |
| Delete child | **C** — inline delete on parent subtask rows + existing child-dialog delete |
| Dialog close on delete | Pop dialog only when the deleted task is **this dialog’s** task |
| Implementation | Approach **1** — mirror `dueDate` patterns |

## 4. Data model

```
tasks.start_date  DATE NULL   -- calendar date only; API "YYYY-MM-DD"
```

- Migration id e.g. `018_task_start_date`: `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date DATE;`
- Prisma `Task.startDate` mapped to `start_date`.
- `CachedTaskListItem` + all list/get DTO mappers include `startDate` alongside `dueDate`.
- Clients treat missing `startDate` on stale cache payloads as `null`.
- Soft validation: when both `startDate` and `dueDate` are non-null, require `startDate <= dueDate`; otherwise `400` with code `START_AFTER_DUE`.

## 5. API

### 5.1 Create / Patch

Extend `CreateTaskSchema` and `PatchTaskSchema`:

```ts
startDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional()
```

- Create: optional `startDate`.
- Patch: `startDate` string sets the date; `startDate: null` clears it (same as existing `dueDate` patch).
- Apply start≤due check after merging patch with the existing row (so patching only one side still validates against the other).

### 5.2 List / Get / Events

- Include `startDate: string | null` on task DTOs returned to clients.
- TaskUpdated / create event payloads may include `startDate` for consistency; Google outbox payload does **not** need a Google `due`-style start field.

### 5.3 Delete

- Existing `DELETE /groups/:groupId/tasks/:code` unchanged (already soft-deletes task + children when deleting a parent; deleting a child deletes that child only).

## 6. Flutter

### 6.1 Models / repository / bloc

- `TaskListItem.startDate` (+ `fromJson` / `copyWith`).
- `CoreRepository` create/patch accept `startDate` / clear.
- Add `TasksStartDateRequested(code, startDate)` mirroring `TasksDueDateRequested` (including `startDate: null` to clear).

### 6.2 Detail dialog

- Next to “Hạn chót”, add “Ngày bắt đầu” picker + clear.
- `_SubtasksSection`: for each child row, trailing delete icon when `_canDelete` allows; confirm dialog; dispatch `TasksDeleteRequested(child.code)`.
- Keep existing “Xóa công việc” on child dialog (already works when WorkspaceBloc is provided into the dialog).
- Ensure dialog providers continue to include `TasksBloc` + `WorkspaceBloc` (needed for `_canDelete`).
- **Delete listener:** today’s listener pops on any delete success — change so it pops + snackbar only when the deleted task is this dialog’s task (match `widget.taskId` / code against the removed task). Deleting a child from the parent dialog must leave the parent dialog open and refresh the subtask list from bloc state.

### 6.3 Board / list / calendar display

- Add `formatBoardDateRangeLabel(startDate, dueDate)` (reuse existing single-date formatting for each side) to render:
  - both: `startLabel → dueLabel`
  - only due: existing due label
  - only start: start label
  - neither: null (hide)
- **Board card:** use the range helper instead of due-only `formatBoardDueLabel`.
- **List rows:** where due is shown in subtitles / secondary text, show the same range (keep `_DueChips` due-only for quick due edit).
- **Calendar day list:** subtitle should include start when present (e.g. range or `Bắt đầu: … · Hạn: …`); eventLoader may stay due-based for this slice (grouping by start is out of scope).

## 7. Google sync

- **No changes** to push/pull handlers for start date.
- Local `startDate` never written to Google `due`.
- Pulling Google `due` continues to update only local `dueDate`.

## 8. Error handling

- API validation failures (`START_AFTER_DUE`, bad date format) surface via existing Flutter error → snackbar path.
- Delete confirm copy for a child: single-task delete wording (no “và mọi subtask” — one-level children cannot have children).

## 9. Testing (minimal)

- Backend: create/patch with `startDate`; reject `startDate > dueDate` (`START_AFTER_DUE`); list returns field; delete child by code.
- Flutter: unit test for `formatBoardDateRangeLabel`; manual check dialog start picker, inline subtask delete (parent stays open), board/list/calendar labels.
