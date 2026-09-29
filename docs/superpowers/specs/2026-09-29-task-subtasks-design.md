# Task subtasks (Google Tasks–like, step B)

**Date:** 2026-09-29  
**Status:** Approved (brainstorming)  
**Approach:** (1) Real child `tasks` rows via `parent_id` (1 level); List indented under parent; Board shows children as mini-rows inside parent card; sync Google Tasks `parent`  
**Scope:** `core-service` schema/API, `google-sync-service` push/pull `parent`, Flutter tasks Board/List/dialog.  
**Roadmap:** A detail dialog (done) → **B this spec** → C unassign + star → D multi task lists.

## 1. Goals

1. Support **one-level subtasks** as first-class tasks (`parent_id`), aligned with Google Tasks.
2. **List UI** like Google: parent row + **indented** children underneath.
3. **Board:** parent cards only for column DnD; **mini child list** inside parent card (checkbox/title); no dragging children between columns.
4. Children have **independent** claim/assign/status/due (group app needs assignees; Google has no assignee field).
5. Bidirectional sync of hierarchy via Google Tasks API `parent` when a personal link exists.

## 2. Non-goals

- Nested depth > 1 (reject creating child-of-child).
- Drag indent/outdent to change parent (can add later).
- Child as standalone DnD card on the board.
- Star / unassign (C), multi tasklist (D).
- Auto-complete parent when all children done (optional later).

## 3. Decisions

| Topic | Choice |
|-------|--------|
| Model | Real `tasks` rows + `parent_id` (not checklist table) |
| Depth | **A** — one level only |
| Assignees | **A** — independent per child |
| UI likeness | Google-like List indent; Board mini-children under parent |
| Implementation | Approach **1** — schema + APIs + Google `parent` + Flutter |

## 4. Data model

```
tasks.parent_id  UUID NULL  FK → tasks.id  ON DELETE CASCADE (or RESTRICT — prefer CASCADE soft-delete aware)
```

- Root: `parent_id IS NULL`.
- Child: `parent_id` points to a **root** task in the **same** `group_id`.
- Validation: parent must exist, same group, `parent.parent_id IS NULL` (no grandchildren).
- Soft-delete: deleting/hiding parent cascades policy — children `deleted_at` with parent (transaction) **or** CASCADE FK if hard delete; match existing soft-delete pattern (set `deleted_at` on children when parent soft-deleted).
- Optional later: `position` for sibling order; B can use `created_at` order.

Indexes: `(group_id, parent_id)` for listing children.

## 5. API

### 5.1 Create

`POST /groups/:groupId/tasks`

Body adds optional:

```json
{ "parentCode": "GRP-12" }
```

- If set: resolve parent, enforce one-level + same group; create child with `parent_id`.
- Child defaults: pool assignees empty, status `TODO`, `allowClaim: true` (same as root) unless body overrides.

### 5.2 List

`GET /groups/:groupId/tasks`

Query:

- `rootsOnly=true` — only `parent_id IS NULL` (Board may use this **or** client filters).
- Default / `includeChildren=true`: return **all** non-deleted tasks (roots + children) with `parentId` / `parentCode` on DTO so Flutter can nest.

DTO fields:

```ts
{
  parentId: string | null,
  parentCode: string | null,
  // existing fields...
}
```

### 5.3 Patch / claim / assign / status

Unchanged endpoints; work on child codes the same as roots.  
Cannot PATCH `parentId` in B (no reparent API).

### 5.4 Errors

| Code | When |
|------|------|
| `INVALID_PARENT` | Unknown code / wrong group / deleted |
| `PARENT_IS_CHILD` | Parent already has `parent_id` |
| `EMPTY_PATCH` etc. | Existing |

## 6. Google sync

### 6.1 Push

Extend `TaskPushPayload` with optional `parentGoogleTaskId` (or resolve server-side):

- When pushing a **child** for user U: look up `GoogleTaskLink` for (U, parentTaskId). If missing, push parent first or skip child until parent linked (document: child push deferred / retry).
- `tasks.insert` / `patch` with `parent: <googleTaskId of parent for that user>`.
- Title/notes/status/due as today.

### 6.2 Pull

- Request `parent` in Tasks API fields.
- If Google item has `parent`: map to local parent via link table; set `parent_id` (only if local parent is root).
- If moving to root on Google (`parent` cleared): set `parent_id = null` only if still one-level rules OK.
- Local-wins / field-hash rules: treat hierarchy carefully — prefer Google parent when pull wins for that field; avoid fighting rapid local creates (hash `parent` like other fields if feasible).

### 6.3 Multi-assignee note

Each assignee has their own Google task copy. Child sync is **per assignee link**: child’s Google node parents under **that user’s** Google id for the parent task. Users without a parent link do not get a child projection until parent is linked.

## 7. Flutter UX

### 7.1 List (Google-like)

- Fetch tasks including children.
- Render: for each root, show root row then indented children (`padding-left`).
- Child row: checkbox/status control + title; tap opens detail dialog for child.
- Root row tap opens parent dialog (existing).

### 7.2 Board

- Columns filter **roots only** for DnD cards.
- Inside parent `_TaskCard`: compact list of children (title + done toggle via status PATCH).
- Edit icon still opens parent dialog (subtask section).

### 7.3 Detail dialog (parent)

- Section **Subtasks**: list children, add field (title → create with `parentCode`), tap child → open/replace dialog for child.
- Child dialog: same fields as A (title, notes, due, status, assignees); no nested subtask UI.

### 7.4 Calendar

- Show roots and children that have `dueDate` (children appear as their own entries, subtitle can note parent code) — simple and useful.

## 8. Testing

- Unit: reject grandchild create; list DTO includes `parentId`.
- Sync: push child includes Google `parent`; pull sets `parent_id`.
- Flutter: List nesting smoke; Board DnD still only roots.

## 9. Implementation order

1. Prisma `parent_id` + migration.
2. Create/list/DTO + validation.
3. Google push/pull `parent`.
4. Flutter models + List indent + Board mini-children + dialog section.

## 10. Follow-ups

- Reparent / indent-outdent drag.
- Sibling `position` order synced with Google.
- Auto-complete parent when all children DONE.
- Step **C** star + unassign; **D** multi tasklist.
