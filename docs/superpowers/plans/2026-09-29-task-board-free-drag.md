# Task Board Free Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow dragging a task card to any of the three board columns (TODO / IN_PROGRESS / DONE), including reopen, via PATCH `status`.

**Architecture:** Extend `PatchTaskSchema` + `patchTask` with optional `status` that runs transition rules (auto-claim, complete, reopen). Flutter board already has DnD; unblock `_onDrag` to call `patchTask(status:)` for any target. Google push mapping unchanged.

**Tech Stack:** Express/Zod (`core-service`), Flutter Bloc, existing `claim`/`complete` semantics reused inside move.

**Spec:** `docs/superpowers/specs/2026-09-29-task-board-free-drag-design.md`

---

### File map

| File | Role |
|------|------|
| `backend/.../core.schemas.ts` | Add `status` to PatchTaskSchema |
| `backend/.../task/status-move.ts` | Pure transition planner + unit tests |
| `backend/.../task/task.service.ts` | Apply status move inside `patchTask` |
| `frontend/.../core_repository.dart` | Send `status` on patch |
| `frontend/.../tasks_bloc.dart` | Free drag via patch; remove allow-list |
| `frontend/.../tasks_tab_page.dart` | Optional VN column labels |

---

### Task 1: Status move planner (TDD)

**Files:**
- Create: `backend/apps/core-service/src/modules/task/status-move.ts`
- Create: `backend/apps/core-service/src/modules/task/status-move.test.ts`

- [x] **Step 1:** Write failing tests for planner outputs: same status → noop; →IN_PROGRESS needs ensureActiveAssignee; →DONE needs ensureActiveAssignee + completeAssignee; →TODO needs reopenAssigneeIfDone + setTodo.
- [x] **Step 2:** Implement planner; tests pass.
- [x] **Step 3:** Commit. (deferred — wait for user request)

### Task 2: Wire PATCH status in core-service

**Files:**
- Modify: `backend/apps/core-service/src/modules/_shared/core.schemas.ts`
- Modify: `backend/apps/core-service/src/modules/task/task.service.ts`

- [x] **Step 1:** Add `status` enum to schema; extend `PatchTaskInput`.
- [x] **Step 2:** In `patchTask`, when status set and different, apply claim/complete/reopen using existing DB patterns + google push.
- [x] **Step 3:** Typecheck; commit. (deferred)

### Task 3: Flutter free drag

**Files:**
- Modify: `frontend/lib/features/home/data/core_repository.dart`
- Modify: `frontend/lib/features/tasks/bloc/tasks_bloc.dart`
- Modify: `frontend/lib/features/tasks/pages/tasks_tab_page.dart` (labels)

- [x] **Step 1:** `patchTask(..., status:)` 
- [x] **Step 2:** `_onDrag` → optimistic + patch any target; remove sequential allow-list.
- [x] **Step 3:** Column headers Todo / Đang làm / Hoàn thành.
- [x] **Step 4:** Commit. (deferred)

### Task 4: Verify

- [x] Manual or analyze: drag Todo→Done, Done→Todo, Done→In progress on board.
- [x] `bun test` in core-service for status-move tests.
