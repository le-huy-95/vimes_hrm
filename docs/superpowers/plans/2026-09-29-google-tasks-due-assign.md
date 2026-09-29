# Google Tasks due date + assignee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add date-only `dueDate` (bidirectional Google Tasks sync) and usable multi-assignee UX (member picker + pool create) on Flutter and backend.

**Architecture:** Extend `tasks.due_date` in `@manage-teams/db`; `core-service` PATCH + pool create; `google-sync-service` push/pull `due`; Flutter chips + member multi-select on existing Tasks tab.

**Tech Stack:** Prisma/SQL migrations, Express/TS (core + google-sync), Vitest, Flutter Bloc/Dio

**Spec:** `docs/superpowers/specs/2026-09-29-google-tasks-due-assign-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/packages/db/src/migrations.ts` | Migration `012_task_due_date` |
| `backend/packages/db/prisma/schema.prisma` | `Task.dueDate DateTime? @db.Date` |
| `backend/apps/core-service/.../core.schemas.ts` | `PatchTaskSchema`, create due optional |
| `backend/apps/core-service/.../task.service.ts` | Pool create, patchTask, due in DTO/push |
| `backend/apps/core-service/.../task.controller.ts` + `task.routes.ts` | PATCH route |
| `backend/apps/core-service/.../outbox.service.ts` | `due?` on notifyGoogleTaskPush |
| `backend/apps/google-sync-service/.../sync-fields.ts` | Payload + diff includes `due` |
| `backend/apps/google-sync-service/.../sync.service.ts` | Enqueue payload includes `due` |
| `backend/apps/google-sync-service/.../sync.controller.ts` | Zod `due` optional |
| `backend/apps/google-sync-service/.../tasks-push.handler.ts` | Map `due` ↔ Google |
| `backend/apps/google-sync-service/.../tasks-pull.handler.ts` | Merge Google `due` → DB |
| `backend/apps/google-sync-service/tests/sync-fields.test.ts` | Due diff tests |
| `frontend/lib/core/models/api_models.dart` | `dueDate` on TaskListItem |
| `frontend/lib/features/home/data/core_repository.dart` | patchTask, claim for pool |
| `frontend/lib/features/tasks/bloc/*` | Due + multi-assign events |
| `frontend/lib/features/tasks/pages/tasks_tab_page.dart` | Chips, member picker, calendar |

---

### Task 1: DB migration + Prisma

**Files:**
- Modify: `backend/packages/db/src/migrations.ts`
- Modify: `backend/packages/db/prisma/schema.prisma`

- [ ] **Step 1: Append migration**

```ts
{
  id: "012_task_due_date",
  sql: `
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE;
`,
},
```

- [ ] **Step 2: Add to Prisma Task model**

```prisma
dueDate DateTime? @map("due_date") @db.Date
```

- [ ] **Step 3: Run migrate + generate**

```bash
cd backend/packages/db && npm run migrate && npm run prisma:generate
```

Expected: `applied 012_task_due_date`

- [ ] **Step 4: Commit**

```bash
git add backend/packages/db/src/migrations.ts backend/packages/db/prisma/schema.prisma
git commit -m "feat(db): add tasks.due_date for Google Tasks sync"
```

---

### Task 2: sync-fields due + tests (TDD)

**Files:**
- Modify: `backend/apps/google-sync-service/src/modules/sync/sync-fields.ts`
- Modify: `backend/apps/google-sync-service/tests/sync-fields.test.ts`

- [ ] **Step 1: Extend failing tests**

```ts
it("includes due when changed", () => {
  const diff = diffPushFields(
    { title: "a", notes: "n", status: "TODO", due: "2026-09-30" },
    { title: "a", notes: "n", status: "TODO" },
  );
  expect(diff).toEqual({ due: "2026-09-30" });
});

it("detects due clear to null", () => {
  const diff = diffPushFields(
    { title: "a", notes: "n", status: "TODO", due: null },
    { title: "a", notes: "n", status: "TODO", due: "2026-09-30" },
  );
  expect(diff).toEqual({ due: null });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd backend/apps/google-sync-service && npx vitest run tests/sync-fields.test.ts
```

- [ ] **Step 3: Implement**

```ts
export type TaskPushPayload = {
  title: string;
  notes: string;
  status: string;
  due?: string | null; // YYYY-MM-DD or null to clear
};

// In diffPushFields: compare due with undefined vs null carefully —
// if next.due !== (prev.due ?? undefined) treating missing prev as undefined;
// if next has due key differently: always set out.due when String(next.due ?? "") !== String(prev.due ?? "")
// OR: if ("due" in next) wait — simpler:
// const nextDue = next.due ?? null;
// const prevDue = prev.due ?? null;
// if (nextDue !== prevDue) out.due = nextDue;

export function dueToGoogleRfc3339(due: string | null | undefined): string | undefined {
  if (due == null || due === "") return undefined;
  return `${due}T00:00:00.000Z`;
}

export function googleDueToDateOnly(due: string | null | undefined): string | null {
  if (!due) return null;
  return due.slice(0, 10);
}
```

Include `due` in `buildFieldHashes`.

- [ ] **Step 4: Tests PASS + commit**

```bash
git commit -m "feat(google-sync): include due in push field diff"
```

---

### Task 3: Push/pull handlers + enqueue

**Files:**
- Modify: `sync.service.ts` EnqueueTaskPushInput + payload/hash
- Modify: `sync.controller.ts` EnqueueSchema `due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()`
- Modify: `tasks-push.handler.ts` — set `requestBody.due` / clear
- Modify: `tasks-pull.handler.ts` — fields include `due`; merge to `tasks.dueDate`

Push mapping:
- If `payload.due` is string → `due: dueToGoogleRfc3339(payload.due)`
- If `payload.due === null` → patch with `due: null` (Google clears)

Pull:
- After title merge block, parse `googleDueToDateOnly(item.due)`; if differs from `task.dueDate` and `!localWinsConflict(task.updatedAt, item.updated)` → update `dueDate`.
- Format DB Date as YYYY-MM-DD via `toISOString().slice(0,10)` (Date column).

- [ ] Commit: `feat(google-sync): sync task due date push and pull`

---

### Task 4: core-service pool create + PATCH + due in push

**Files:**
- `core.schemas.ts` — PatchTaskSchema; CreateTaskSchema optional `dueDate`
- `task.service.ts` — create pool; `patchTask`; list/get include dueDate; push includes due; assign allows **group member** (change `requireGroupAdmin` → `requireGroupMember` for actor); on assign if task TODO → IN_PROGRESS; ensure-task `memberIds: unique([...assigneeIds, userId])`
- `outbox.service.ts` — `due?: string | null`
- `task.controller.ts` + `task.routes.ts` — PATCH

Helper:

```ts
function formatDue(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}
```

Create:

```ts
const assigneeIds = [...new Set(input.assigneeIds ?? [])];
// status: "TODO"
// dueDate: parse input.dueDate if present
```

patchTask:

```ts
export async function patchTask(groupId, code, userId, input: { title?, description?, dueDate?: string | null }) {
  await requireGroupMember(groupId, userId);
  // validate dueDate /^YYYY-MM-DD$/ or null → INVALID_DUE_DATE
  // update task, bump version, TaskUpdated event
  // for each ACTIVE assignee notifyGoogleTaskPush({ ..., due: formatDue(task.dueDate) })
}
```

All existing `notifyGoogleTaskPush` call sites: pass `due: formatDue(task.dueDate)` when task row available (claim/assign/complete/create).

- [ ] Commit: `feat(core): task dueDate PATCH and pool create without auto-assign`

---

### Task 5: Flutter models + repository + bloc

**Files:**
- `api_models.dart` — `dueDate` (DateTime? date-only or String?)
- Prefer `String? dueDate` as `YYYY-MM-DD` for simplicity
- `core_repository.dart` — `patchTask`, optionally `dueDate` on create
- `tasks_event.dart` — `TasksDueDateRequested`, `TasksAssignManyRequested`, `TasksClaimRequested` (if claim only via drag today — list Claim for TODO)
- `tasks_bloc.dart` — handlers; refresh after

```dart
class TasksDueDateRequested extends TasksEvent {
  const TasksDueDateRequested({required this.code, this.dueDate});
  final String code;
  final String? dueDate; // null = clear
}
class TasksAssignManyRequested extends TasksEvent {
  const TasksAssignManyRequested({required this.code, required this.userIds});
  final String code;
  final List<String> userIds;
}
```

- [ ] Commit: `feat(flutter): task dueDate model and bloc events`

---

### Task 6: Flutter UI

**Files:**
- `tasks_tab_page.dart`

List/Board:
- Due chips: Hôm nay / Ngày mai / picker / clear
- Assignees row: chips from `task.assignees`; Gán opens dialog with `CheckboxListTile` from `getGroup(groupId).members` excluding already assigned; Claim when empty or allowClaim
- Replace raw userId prompt
- Calendar `_forDay` uses `dueDate` parse

```dart
DateTime? _parseDue(String? d) {
  if (d == null || d.length < 10) return null;
  return DateTime.parse(d); // local date interpret
}
```

- [ ] Commit: `feat(flutter): due chips and member assign picker on tasks tab`

---

### Task 7: Verify

```bash
cd backend/apps/google-sync-service && npx vitest run tests/sync-fields.test.ts
cd backend/packages/db && npm run migrate
# smoke: create task → no assignee; PATCH due; assign → push payload has due
```

Hot restart Flutter and check list chips.

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| due_date schema | 1 |
| PATCH due | 4 |
| Pool create / TODO | 4 |
| Push/pull due | 2–3 |
| Flutter chips/picker/calendar | 5–6 |
| ensure-task includes creator | 4 |
| Assign NOT_GROUP_MEMBER | already via requireGroupMember(target) |
| Out of scope items | skipped |
