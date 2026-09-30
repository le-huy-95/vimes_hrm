# Multi Google Task lists (step D)

**Date:** 2026-09-30  
**Status:** Approved (brainstorming)  
**Approach:** (1) Per-user map table `userId + groupId → googleTasklistId`; Sync tab UI + Tasks banner; no sync until mapped  
**Scope:** `google-sync-service` schema/API + push/pull resolve, Flutter Sync + Tasks banner.  
**Roadmap:** A detail dialog → B subtasks → C star + unassign → **D this spec**.

## 1. Goals

1. Each user maps **one of their Google Task lists** to **one app group**.
2. **Unmapped group** → no Google Tasks push/pull for that group; surface a Tasks banner and configure on Sync.
3. Enforce **1 list ↔ 1 group** per user (no shared list across two groups for the same user).
4. Replace the single hard-coded list (`GOOGLE_TASKS_LIST_TITLE` / `"Manage Teams"`) as the sync target once maps exist.

## 2. Non-goals

- Migrating existing Google tasks between lists when the user remaps.
- A shared Google list for the whole team (Google Tasks are personal).
- Creating Google task lists from the app (user creates lists in Google; app only selects).
- Mapping UI inside the task detail dialog.
- Multiple Google lists per single group.
- Changing Sheets / Chat sync.

## 3. Decisions (from brainstorming)

| Topic | Choice |
|-------|--------|
| Mapping model | User manually maps Google list ↔ group (not auto 1:1 by name) |
| Who configures | Each user maps their own lists |
| Unmapped behavior | No push/pull until mapped (no `"Manage Teams"` fallback) |
| UI | Sync tab mapping section + Tasks banner with deep-link to Sync |
| Cardinality | 1 list ↔ max 1 group per user |
| Remap | New tasks use new list; old `google_task_links` stay on old list (no migrate in MVP) |

## 4. Data model

New table `user_group_tasklist_maps` (Prisma model name e.g. `UserGroupTasklistMap`):

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `user_id` | uuid FK → users | |
| `group_id` | uuid FK → groups | |
| `google_tasklist_id` | text | Google Tasks API list id |
| `google_tasklist_title` | text nullable | Cached display title |
| `created_at` / `updated_at` | timestamptz | |

Constraints:

- `UNIQUE (user_id, group_id)` — one map per group per user  
- `UNIQUE (user_id, google_tasklist_id)` — one group per list per user  

Migration id: `017_user_group_tasklist_maps` (or next free id after `016_task_starred`).

## 5. Sync behavior

### Push (`TASKS_PUSH`)

1. Load local task → `groupId`.
2. Look up map `(userId, groupId)`.
3. If missing → mark job done with reason `no_tasklist_map` (do not retry forever).
4. If present → create/update Google task in `google_tasklist_id` (same as today, but list id from map instead of `ensureAppTaskList` by fixed title).
5. If mapped list returns 404 / gone → treat map as broken; stop push until user remaps (clear or flag; surface in status).

### Pull / Full

1. Enumerate maps for the user.
2. Pull **only** those Google lists.
3. Import / update into the mapped `groupId` (preferred group override still respects map when present).
4. Do not import from unmapped lists.

### Delete / unassign

Unchanged aside from using the link’s stored `google_tasklist_id` (already on `google_task_links`).

### Env change

`GOOGLE_TASKS_LIST_TITLE` / auto-create `"Manage Teams"` is **no longer** the default push target. Optional: keep helper only for docs/migration notes; runtime must not invent a fallback list for unmapped groups.

## 6. API (google-sync-service, user JWT)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/sync/tasklists` | List Google task lists for the authenticated user |
| `GET` | `/sync/tasklist-maps` | Current maps + groups the user belongs to (include unmapped) |
| `PUT` | `/sync/tasklist-maps/:groupId` | Body `{ googleTasklistId }` — set/replace map; 409 if list already mapped to another group |
| `DELETE` | `/sync/tasklist-maps/:groupId` | Remove map → stop sync for that group |

`GET /sync/status` (or maps payload) should expose enough for the Flutter banner, e.g. whether the **current workspace group** is mapped / `unmappedGroupIds`.

Auth: require Google linked + Tasks scope; otherwise endpoints return clear `AUTH_REQUIRED` / empty lists with UI hint.

## 7. Flutter UI

### Sync tab

- Section **Task list mapping** above or beside existing Tasks Pull/Full.
- Rows: each membership group → dropdown of Google lists.
- Lists already mapped to another group disabled (or omitted) in the picker.
- Unmapped rows visually distinct (“Chưa gắn”).

### Tasks tab

- If selected group is unmapped (and user has Google Tasks ready): yellow banner  
  “Chưa gắn Google list — Gắn ngay” → navigate to Sync tab (and optionally scroll/focus mapping).
- No mapping controls in task detail dialog (MVP).

## 8. Error handling

- Duplicate list→group: `409` with stable code (e.g. `TASKLIST_IN_USE`).
- Not a group member: `403` / `404`.
- Google list deleted: map invalid; banner + Sync row show broken state; no push/pull until remapped.
- No Google account: mapping UI disabled with reconnect hint.

## 9. Testing

- Unit: resolve map; push skip when unmapped; unique constraint / 409 on second group with same list.
- Manual: map list → create task appears on that Google list; unmap → no further push; banner when unmapped; remap → new tasks go to new list, old Google tasks untouched.

## 10. Implementation order

1. Migration + Prisma model.
2. Map CRUD APIs + list Google tasklists.
3. Push/pull use map; remove fixed-title fallback.
4. Flutter Sync mapping UI + status/banner on Tasks.
5. Tests above.

## 11. Follow-ups (explicitly later)

- Migrate links when remapping.
- Create Google list from app.
- Per-group settings shortcut for map.
- Admin-visible “who has mapped” (still per-user lists).
