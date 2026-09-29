# Task detail dialog (Google Tasks–like, step A)

**Date:** 2026-09-29  
**Status:** Approved (brainstorming)  
**Approach:** (1) Center dialog reusing existing PATCH / claim / assign APIs; auto-save per field  
**Scope:** Flutter tasks tab only (Board / List / Calendar). No new backend schema.  
**Roadmap (out of this spec):** B subtasks → C unassign + star → D multi Google task lists.

## 1. Goals

1. Open a **center dialog** to edit one task’s Google-Tasks-like fields in one place.
2. **Auto-save** each field when the user finishes editing / selects a value.
3. Open without breaking board drag-and-drop.
4. Reuse existing APIs: `PATCH` (title, description, dueDate, status), claim, assign (multi).

## 2. Non-goals

- Subtasks (B), star / unassign (C), multi tasklist mapping (D).
- Bottom/side sheet or dedicated detail route.
- Explicit “Lưu” button for the whole form.
- New core-service endpoints (unless a gap is discovered during implementation).
- Changing Google sync field mapping.

## 3. Decisions

| Topic | Choice |
|-------|--------|
| Feature order | A → B → C → D; this spec = **A only** |
| Chrome | **Dialog** giữa màn |
| Persist | **Auto-save** per field |
| Open gesture | **C** — List & Calendar: tap row; Board: icon on card |
| Implementation | Thin dialog + existing `TasksBloc` / repository |

## 4. Current gaps

| Area | Today | Target |
|------|--------|--------|
| Board card | Drag only; due/assign chips mostly on List | Icon opens detail dialog |
| List / Calendar | Inline chips / limited actions | Tap row opens same dialog |
| Title / notes edit | Create only (or none after create) | Editable in dialog via PATCH |
| Status in UI | Board drag / list buttons | Also changeable in dialog (PATCH status) |

## 5. UX

### 5.1 Open

- **Board:** trailing/edit icon on card (outside drag hit target as needed). Single tap icon → dialog. Body remains draggable.
- **List:** tap row (not only action chips) → dialog. Chips may remain as shortcuts.
- **Calendar:** tap task entry → dialog.

### 5.2 Dialog contents

| Field | Behavior |
|-------|----------|
| Code | Read-only |
| Title | Text field; PATCH on blur if changed |
| Notes (`description`) | Multiline; PATCH on blur if changed |
| Due | Existing chips (today / tomorrow / picker / clear); PATCH immediately |
| Status | Segmented or dropdown: Todo / Đang làm / Hoàn thành; PATCH `status` immediately (same rules as board drag) |
| Assignees | Show names; Claim if pool; “Gán” multi-select (existing member picker) |

Close via X / barrier dismiss; in-flight saves finish or surface error via snackbar.

### 5.3 Auto-save rules

- Debounce optional for title/notes (e.g. 300–500ms after blur only is enough — **blur-save**, no keystroke spam).
- Due / status / assign: fire on selection.
- Failure: snackbar + keep previous server value after refresh (existing `TasksFailure` pattern).
- Success: soft refresh task list (or patch local item) so board/list stay in sync while dialog stays open.

## 6. Flutter structure

- Widget: e.g. `TaskDetailDialog` under `features/tasks/widgets/`.
- Entry: helper `showTaskDetailDialog(context, task)`.
- Wire from `_TaskCard` (icon), `_ListView` row, `_CalendarView` entry.
- Prefer dispatching existing `TasksBloc` events (`TasksDueDateRequested`, `TasksAssignManyRequested`, `TasksClaimRequested`, `TasksDragRequested` or a small `TasksPatchRequested` for title/notes/status).
- If title/notes lack events today, add `TasksPatchRequested({code, title?, description?, status?})` calling `CoreRepository.patchTask`.

## 7. Backend

No change required if PATCH already supports `title`, `description`, `dueDate`, `status` (status from free-drag work). Verify gateway routes unchanged.

## 8. Errors

| Case | UX |
|------|-----|
| PATCH / claim / assign fail | Snackbar; dialog fields reflect last good refresh |
| Empty title on blur | Reject locally; do not PATCH empty title |
| No group selected | Dialog not opened |

## 9. Testing

- Manual: Board icon opens dialog without starting drag; List/Calendar tap opens; title blur persists after refresh; due/status/assign update board columns.
- Optional: bloc test for patch event if patterns exist.

## 10. Follow-ups

- **B:** Subtasks UI inside same dialog + parent/child model + Google `parent`.
- **C:** Unassign + star in dialog.
- **D:** Multi tasklist sync mapping.
