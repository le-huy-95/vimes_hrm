# Task Detail Dialog (Step A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center dialog to edit task title/notes/due/status/assignees with auto-save; Board icon + List/Calendar row tap open it.

**Architecture:** New `TaskDetailDialog` widget + `TasksPatchRequested` for title/notes/status; reuse due/claim/assign events. Wire open gestures from board/list/calendar.

**Tech Stack:** Flutter, flutter_bloc, existing CoreRepository.patchTask

**Spec:** `docs/superpowers/specs/2026-09-29-task-detail-dialog-design.md`

---

### Task 1: Bloc patch event

- Modify: `tasks_event.dart`, `tasks_bloc.dart`
- [x] Add `TasksPatchRequested` (code, title?, description?, status?)
- [x] Handler calls `patchTask` + refresh

### Task 2: Detail dialog widget

- Create: `frontend/lib/features/tasks/widgets/task_detail_dialog.dart`
- [x] Dialog with title/notes blur-save, due chips, status dropdown, assignee row
- [x] `showTaskDetailDialog(context, task)`

### Task 3: Wire open gestures

- Modify: `tasks_tab_page.dart`
- [x] Board: edit icon on card
- [x] List: InkWell/tap row → dialog
- [x] Calendar: tap entry → dialog

### Task 4: Verify

- [x] `dart analyze` on touched files
