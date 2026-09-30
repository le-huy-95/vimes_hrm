# Task start date + delete child Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add app-only editable `startDate` (dialog edit; board/list/calendar display) and allow deleting subtasks from the parent detail dialog without closing the parent.

**Architecture:** Mirror existing `dueDate` through DB → core-service API/DTO/cache → Flutter model/bloc/UI. Do not touch google-sync for start. Fix delete `BlocListener` so parent dialog stays open when a child is deleted.

**Tech Stack:** SQL migrations + Prisma, Express/TS (`core-service`), Vitest, Flutter Bloc

**Spec:** `docs/superpowers/specs/2026-09-30-task-start-date-delete-child-design.md`

**Note:** If `migrations.ts` already ends with `017_org_invitation_status` (or any other `017_*`), use `018_task_start_date`. Otherwise use the next free id after the last committed migration.

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/packages/db/src/migrations.ts` | `018_task_start_date` (or next free id) |
| `backend/packages/db/prisma/schema.prisma` | `Task.startDate` |
| `backend/apps/core-service/src/modules/_shared/core.schemas.ts` | Zod `startDate` on create/patch |
| `backend/apps/core-service/src/modules/task/task-dates.ts` | Pure parse + `START_AFTER_DUE` check (testable) |
| `backend/apps/core-service/tests/task-dates.test.ts` | Unit tests for date helpers |
| `backend/apps/core-service/src/modules/task/task.service.ts` | create/patch/list/get include `startDate` |
| `backend/apps/core-service/src/infra/task-cache.ts` | `CachedTaskListItem.startDate` |
| `frontend/lib/core/models/api_models.dart` | `TaskListItem.startDate` |
| `frontend/lib/features/home/data/core_repository.dart` | patch/create `startDate` |
| `frontend/lib/features/tasks/bloc/tasks_event.dart` | `TasksStartDateRequested` |
| `frontend/lib/features/tasks/bloc/tasks_bloc.dart` | Handler mirror of due |
| `frontend/lib/features/tasks/board_task_display.dart` | `formatBoardDateRangeLabel` |
| `frontend/test/features/tasks/board_task_display_test.dart` | Range label tests |
| `frontend/lib/features/tasks/widgets/task_detail_dialog.dart` | Start picker, inline delete, fix pop listener |
| `frontend/lib/features/tasks/pages/tasks_tab_page.dart` | Board/list/calendar display |

---

### Task 1: DB migration + Prisma

**Files:**
- Modify: `backend/packages/db/src/migrations.ts`
- Modify: `backend/packages/db/prisma/schema.prisma`

- [ ] **Step 1: Append migration** (use next free id; example assumes `018`)

```ts
{
  id: "018_task_start_date",
  sql: `
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date DATE;
`,
},
```

- [ ] **Step 2: Add Prisma field on `Task`** (next to `dueDate`)

```prisma
startDate DateTime? @map("start_date") @db.Date
```

- [ ] **Step 3: Migrate + generate**

```bash
cd backend/packages/db && bun run migrate && bun run prisma:generate
```

Expected: migration applied; client types include `startDate`.

- [ ] **Step 4: Commit**

```bash
git add backend/packages/db/src/migrations.ts backend/packages/db/prisma/schema.prisma
git commit -m "feat(db): add tasks.start_date"
```

---

### Task 2: Date helpers + Vitest (TDD)

**Files:**
- Create: `backend/apps/core-service/src/modules/task/task-dates.ts`
- Create: `backend/apps/core-service/tests/task-dates.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  assertStartNotAfterDue,
  formatTaskDate,
  parseTaskDateOrThrow,
} from "../src/modules/task/task-dates.js";
import { AppError } from "@manage-teams/lib";

describe("parseTaskDateOrThrow", () => {
  it("returns undefined for undefined", () => {
    expect(parseTaskDateOrThrow(undefined)).toBeUndefined();
  });
  it("returns null for null", () => {
    expect(parseTaskDateOrThrow(null)).toBeNull();
  });
  it("parses YYYY-MM-DD as UTC midnight Date", () => {
    const d = parseTaskDateOrThrow("2026-09-30");
    expect(d?.toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });
  it("rejects bad format", () => {
    expect(() => parseTaskDateOrThrow("30/09/2026")).toThrow(AppError);
  });
});

describe("assertStartNotAfterDue", () => {
  it("allows null sides", () => {
    expect(() => assertStartNotAfterDue(null, null)).not.toThrow();
    expect(() => assertStartNotAfterDue(new Date("2026-09-30T00:00:00.000Z"), null)).not.toThrow();
  });
  it("allows start == due", () => {
    const d = new Date("2026-09-30T00:00:00.000Z");
    expect(() => assertStartNotAfterDue(d, d)).not.toThrow();
  });
  it("rejects start after due with START_AFTER_DUE", () => {
    try {
      assertStartNotAfterDue(
        new Date("2026-10-02T00:00:00.000Z"),
        new Date("2026-10-01T00:00:00.000Z"),
      );
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("START_AFTER_DUE");
    }
  });
});

describe("formatTaskDate", () => {
  it("formats Date to YYYY-MM-DD", () => {
    expect(formatTaskDate(new Date("2026-09-30T00:00:00.000Z"))).toBe("2026-09-30");
  });
  it("returns null for null/undefined", () => {
    expect(formatTaskDate(null)).toBeNull();
    expect(formatTaskDate(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd backend/apps/core-service && bun run test -- tests/task-dates.test.ts
```

Expected: module not found / FAIL.

- [ ] **Step 3: Implement helpers**

```ts
import { AppError } from "@manage-teams/lib";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function formatTaskDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

/** undefined = omit; null = clear; Date = set */
export function parseTaskDateOrThrow(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!DATE_RE.test(value)) {
    throw new AppError("Ngày không hợp lệ", "INVALID_DATE", 400);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

export function assertStartNotAfterDue(
  start: Date | null | undefined,
  due: Date | null | undefined,
): void {
  if (!start || !due) return;
  if (start.getTime() > due.getTime()) {
    throw new AppError(
      "Ngày bắt đầu không được sau hạn chót",
      "START_AFTER_DUE",
      400,
    );
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd backend/apps/core-service && bun run test -- tests/task-dates.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core-service/src/modules/task/task-dates.ts backend/apps/core-service/tests/task-dates.test.ts
git commit -m "feat(core): add start/due date helpers with START_AFTER_DUE"
```

---

### Task 3: core-service schema + service + cache

**Files:**
- Modify: `backend/apps/core-service/src/modules/_shared/core.schemas.ts`
- Modify: `backend/apps/core-service/src/modules/task/task.service.ts`
- Modify: `backend/apps/core-service/src/infra/task-cache.ts`

- [ ] **Step 1: Extend Zod**

In both `CreateTaskSchema` and `PatchTaskSchema`, add:

```ts
startDate: z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
  .optional(),
```

- [ ] **Step 2: Wire `task.service.ts`**

1. Import `assertStartNotAfterDue`, `formatTaskDate`, `parseTaskDateOrThrow` from `./task-dates.js`.
2. Prefer using these for due as well **or** keep existing `formatDue`/`parseDueOrThrow` and only use new helpers for start — either is fine; if keeping old due helpers, call `assertStartNotAfterDue` with merged dates.
3. Extend `CreateTaskInput` / `PatchTaskInput` with `startDate?: string | null`.
4. **createTask:** parse `startDate`; after resolving due+start, `assertStartNotAfterDue(startParsed ?? null, dueParsed ?? null)`; persist `startDate`; include `startDate: formatTaskDate(t.startDate)` (or `formatDue`) on returned DTO and event payloads that already carry `dueDate`.
5. **patchTask:** treat empty patch if only `startDate` provided (add `input.startDate === undefined` to the EMPTY_PATCH guard); parse start; merge with existing:

```ts
const nextStart =
  startParsed === undefined ? existing.startDate : startParsed;
const nextDue =
  dueParsed === undefined ? existing.dueDate : dueParsed;
assertStartNotAfterDue(nextStart, nextDue);
if (startParsed !== undefined) data.startDate = startParsed;
```

Include `startDate` in TaskUpdated event/outbox payload alongside `dueDate`.

6. **listTasks / getTask mapped DTOs:** add `startDate: formatDue(t.startDate)` (or `formatTaskDate`) next to `dueDate`.
7. Do **not** pass `startDate` into `notifyGoogleTaskPush` / Google `due` fields.

- [ ] **Step 3: Cache type**

```ts
export type CachedTaskListItem = {
  // ...existing...
  dueDate: string | null;
  startDate: string | null;
  // ...
};
```

Ensure list mapper that builds cache entries sets `startDate`.

- [ ] **Step 4: Typecheck**

```bash
cd backend/apps/core-service && bun run typecheck
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core-service/src/modules/_shared/core.schemas.ts \
  backend/apps/core-service/src/modules/task/task.service.ts \
  backend/apps/core-service/src/infra/task-cache.ts
git commit -m "feat(core): expose startDate on task create/patch/list"
```

---

### Task 4: Flutter model + repository + bloc

**Files:**
- Modify: `frontend/lib/core/models/api_models.dart`
- Modify: `frontend/lib/features/home/data/core_repository.dart`
- Modify: `frontend/lib/features/tasks/bloc/tasks_event.dart`
- Modify: `frontend/lib/features/tasks/bloc/tasks_bloc.dart`

- [ ] **Step 1: `TaskListItem`**

Add `this.startDate` field (`String?`), parse `j['startDate'] ?? j['start_date']` in `fromJson`, thread through `copyWith` with `clearStartDate` mirroring `clearDueDate`.

- [ ] **Step 2: Repository**

- `createTask`: optional `String? startDate`; send `'startDate': startDate` when non-null; set on optimistic `TaskListItem` return.
- `patchTask`: add `String? startDate`, `bool clearStartDate = false`; body:

```dart
if (clearStartDate) 'startDate': null,
if (!clearStartDate && startDate != null) 'startDate': startDate,
```

- [ ] **Step 3: Event**

```dart
class TasksStartDateRequested extends TasksEvent {
  const TasksStartDateRequested({
    required this.code,
    this.startDate,
  });
  final String code;
  /// YYYY-MM-DD, or null to clear.
  final String? startDate;
  @override
  List<Object?> get props => [code, startDate];
}
```

Register `on<TasksStartDateRequested>(_onStartDate)` in `TasksBloc`.

- [ ] **Step 4: Handler** (mirror `_onDueDate`)

```dart
Future<void> _onStartDate(
  TasksStartDateRequested event,
  Emitter<TasksState> emit,
) async {
  final prev = _ready;
  if (_groupId == null || prev == null) return;
  emit(prev.copyWith(busy: true));
  try {
    await _core.patchTask(
      _groupId!,
      event.code,
      startDate: event.startDate,
      clearStartDate: event.startDate == null,
    );
    final tasks = await _core.listTasks(_groupId!);
    final next = prev.copyWith(tasks: tasks, busy: false);
    emit(TasksActionSuccess(
      event.startDate == null ? 'Đã xóa ngày bắt đầu' : 'Đã đặt ngày bắt đầu',
      ready: next,
    ));
    emit(next);
  } catch (e) {
    emit(TasksFailure(_msg(e), previous: prev));
    emit(prev.copyWith(busy: false));
  }
}
```

- [ ] **Step 5: Analyze**

```bash
cd frontend && dart analyze lib/core/models/api_models.dart lib/features/home/data/core_repository.dart lib/features/tasks/bloc
```

Expected: no issues.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/core/models/api_models.dart \
  frontend/lib/features/home/data/core_repository.dart \
  frontend/lib/features/tasks/bloc/tasks_event.dart \
  frontend/lib/features/tasks/bloc/tasks_bloc.dart
git commit -m "feat(tasks): wire startDate through model, API client, and bloc"
```

---

### Task 5: Board date range helper (TDD)

**Files:**
- Modify: `frontend/lib/features/tasks/board_task_display.dart`
- Modify: `frontend/test/features/tasks/board_task_display_test.dart`

- [ ] **Step 1: Add failing tests**

```dart
group('formatBoardDateRangeLabel', () {
  final now = DateTime(2026, 9, 30);
  test('null when both empty', () {
    expect(formatBoardDateRangeLabel(null, null, now: now), isNull);
  });
  test('due only', () {
    expect(
      formatBoardDateRangeLabel(null, '2026-09-30', now: now),
      'Hôm nay',
    );
  });
  test('start only', () {
    expect(
      formatBoardDateRangeLabel('2026-10-12', null, now: now),
      '12 thg 10',
    );
  });
  test('both with arrow', () {
    expect(
      formatBoardDateRangeLabel('2026-09-28', '2026-10-05', now: now),
      '28 thg 9 → 5 thg 10',
    );
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd frontend && flutter test test/features/tasks/board_task_display_test.dart
```

- [ ] **Step 3: Implement**

```dart
String? formatBoardDateRangeLabel(
  String? startDate,
  String? dueDate, {
  DateTime? now,
}) {
  final start = formatBoardDueLabel(startDate, now: now);
  final due = formatBoardDueLabel(dueDate, now: now);
  if (start == null && due == null) return null;
  if (start == null) return due;
  if (due == null) return start;
  return '$start → $due';
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd frontend && flutter test test/features/tasks/board_task_display_test.dart
```

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/features/tasks/board_task_display.dart \
  frontend/test/features/tasks/board_task_display_test.dart
git commit -m "feat(tasks): format board start→due date range label"
```

---

### Task 6: Detail dialog — start picker, inline delete, pop fix

**Files:**
- Modify: `frontend/lib/features/tasks/widgets/task_detail_dialog.dart`

- [ ] **Step 1: Fix delete listener** so parent stays open when a child is deleted

Replace listen/listener logic:

```dart
listenWhen: (prev, curr) =>
    curr is TasksActionSuccess &&
    curr.message == TasksBloc.deleteSuccessMessage,
listener: (context, state) {
  final success = state as TasksActionSuccess;
  SimpleSnackbarService.showSuccess(success.message);
  final stillPresent =
      success.ready.tasks.any((t) => t.id == widget.taskId);
  if (!stillPresent) {
    Navigator.of(context).pop();
  }
},
```

- [ ] **Step 2: Start date UI** next to hạn chót

Add section label `Ngày bắt đầu` and a `_StartSection` (or generalize `_DueSection`) that dispatches:

```dart
TasksStartDateRequested(code: task.code, startDate: ymdOrNull)
```

Clear button sends `startDate: null`. Reuse the same `showDatePicker` pattern as `_DueSection`.

- [ ] **Step 3: Inline delete on subtask rows**

In `_SubtasksSection` `ListTile`, add trailing delete when allowed:

```dart
trailing: canDeleteChild
  ? IconButton(
      icon: const Icon(Icons.delete_outline, color: ColorSkin.error),
      tooltip: 'Xóa subtask',
      onPressed: busy ? null : () => _confirmDeleteChild(context, c),
    )
  : null,
```

Pass `canDelete` via a callback/`_canDelete(context, c)` (needs `AuthBloc` + `WorkspaceBloc` — already provided on dialog). Confirm dialog copy for a child: single-task wording only (`Task ${c.code} sẽ bị xóa…`). On confirm: `TasksDeleteRequested(c.code)`.

- [ ] **Step 4: Manual smoke (Chrome)**

- Open parent task → delete child → parent stays open, child row gone, snackbar shown.
- Open child → delete → dialog closes.
- Set/clear start date; set start after due → snackbar error.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/features/tasks/widgets/task_detail_dialog.dart
git commit -m "feat(tasks): start date picker, inline subtask delete, fix dialog pop"
```

---

### Task 7: Board / list / calendar display

**Files:**
- Modify: `frontend/lib/features/tasks/pages/tasks_tab_page.dart`

- [ ] **Step 1: Board card**

Replace:

```dart
final dueLabel = formatBoardDueLabel(task.dueDate);
```

with:

```dart
final dueLabel = formatBoardDateRangeLabel(task.startDate, task.dueDate);
```

(Keep variable name or rename to `dateLabel` — either fine.)

- [ ] **Step 2: List**

Above `_DueChips(task: t)`, if range label non-null, show a small `Text` with `formatBoardDateRangeLabel(t.startDate, t.dueDate)`. Keep `_DueChips` due-only.

- [ ] **Step 3: Calendar day list subtitle**

```dart
subtitle: Text(
  '${formatBoardDateRangeLabel(t.startDate, t.dueDate) ?? 'Không có ngày'} · ${t.status}',
),
```

Leave `eventLoader` / `_forDay` due-based (no grouping by start).

- [ ] **Step 4: Analyze + commit**

```bash
cd frontend && dart analyze lib/features/tasks/pages/tasks_tab_page.dart
git add frontend/lib/features/tasks/pages/tasks_tab_page.dart
git commit -m "feat(tasks): show start→due range on board, list, calendar"
```

---

### Task 8: Spec migration id note + final verify

- [ ] **Step 1: If design spec still says `017_task_start_date`, update to the id actually used** in `docs/superpowers/specs/2026-09-30-task-start-date-delete-child-design.md` and commit docs if changed.

- [ ] **Step 2: Final checks**

```bash
cd backend/apps/core-service && bun run test && bun run typecheck
cd frontend && flutter test test/features/tasks/board_task_display_test.dart
```

Expected: all pass.

- [ ] **Step 3: Commit any leftover docs-only fix**

```bash
git add docs/superpowers/specs/2026-09-30-task-start-date-delete-child-design.md
git commit -m "docs: align start_date migration id with implementation"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `tasks.start_date` + Prisma | 1 |
| `START_AFTER_DUE` validation | 2–3 |
| Create/patch/list `startDate` | 3 |
| Cache DTO | 3 |
| No Google sync changes | 3 (explicit non-touch) |
| Flutter model/repo/bloc event | 4 |
| Dialog start picker | 6 |
| Inline subtask delete | 6 |
| Pop only when own task deleted | 6 |
| Board range label | 5–7 |
| List/calendar display | 7 |
| Tests | 2, 5, 8 |
