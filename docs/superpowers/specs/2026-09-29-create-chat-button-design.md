# Create chat button (group + DM)

**Date:** 2026-09-29  
**Status:** Approved (brainstorming)  
**Approach:** (1) Public idempotent `ensure` APIs on chat-service + Flutter `+` picker  
**Scope:** Backend `chat-service` (public ensure-group / ensure-dm, DM uniqueness) and Flutter Chat tab (create button, sheet, DM list section).

## 1. Goals

1. Add a **create chat** entry on the Chat tab so users can start conversations without relying only on auto-ensure from core/task.
2. Support **group chat** for the current workspace/group and **1-1 DM** with a single member of that group.
3. Keep create **idempotent**: existing conversation is opened, not duplicated.
4. Scope DMs to the **current group** (same two users in another group → separate DM).

## 2. Non-goals

- Multi-select “small group” chats (subset of members).
- Global DMs across groups.
- Creating task threads from the `+` button.
- Redesign of message thread / reactions / search.
- Changing internal ensure routes used by core/task.

## 3. Decisions (from brainstorming)

| Topic | Choice |
|-------|--------|
| Chat kinds from `+` | Group chat **and** 1-1 with a group member |
| Picker UX | **B** — one sheet: «Cả nhóm» first, then member list |
| DM scope | **A** — DM belongs to current `groupId` |
| Implementation | **1** — public JWT `ensure-*` on chat-service |

## 4. Current gaps

| Area | Today | Target |
|------|--------|--------|
| Public create API | None (only internal `ensure-group` / `ensure-task`) | `POST /conversations/ensure-group`, `POST /conversations/ensure-dm` |
| DM uniqueness | `type` allows `DM` but no unique pair index | Unique DM per `(group_id, sorted user pair)` |
| Flutter create UI | List only; no create control | `+` → sheet → ensure → select |
| Flutter list | Sections NHÓM / THEO TASK | + section **TIN NHẮN** for DMs in current group |
| `ChatRepository` | list / messages / send / read / react / search | + ensure group / ensure DM |

## 5. Data model

Existing:

```
conversations.type IN ('GROUP', 'TASK_THREAD', 'DM')
UNIQUE (group_id) WHERE type = 'GROUP'
UNIQUE (task_id) WHERE type = 'TASK_THREAD'
```

Add:

- `conversations.dm_pair_key TEXT NULL` — for `type = 'DM'`, value `min(userId, peerId) || ':' || max(userId, peerId)`.
- Unique index: `(group_id, dm_pair_key) WHERE type = 'DM' AND group_id IS NOT NULL AND dm_pair_key IS NOT NULL`.
- DM rows: `group_id` required; `task_id` null; exactly two `conversation_members` (caller + peer), status `ACTIVE`.
- Title: backend may leave `null` or `"DM"`; Flutter shows peer display name / email from group member list.

Prisma schema + SQL migration (same style as existing `migrations.ts` / Prisma) must stay in sync.

## 6. API

Gateway already proxies `/conversations` to chat-service. Auth: JWT user (same as list/messages).

### 6.1 Ensure group chat

`POST /conversations/ensure-group`

```json
{ "groupId": "<uuid>" }
```

- Caller must be ACTIVE `group_members` of `groupId` (chat-service reads shared Prisma DB).
- Create GROUP conversation if missing (reuse existing unique on `group_id`); upsert **all** ACTIVE `group_members` into `conversation_members` (same behavior as internal ensure-group).
- Response:

```json
{
  "conversationId": "<uuid>",
  "type": "GROUP",
  "groupId": "<uuid>",
  "title": "Group chat"
}
```

### 6.2 Ensure DM

`POST /conversations/ensure-dm`

```json
{
  "groupId": "<uuid>",
  "peerUserId": "<uuid>"
}
```

- Caller ACTIVE member of group; `peerUserId` ACTIVE member; `peerUserId !== caller`.
- Lookup by `(groupId, dm_pair_key)`; create if missing; upsert both members.
- Race on unique → re-fetch and return existing.
- Errors: `401` unauthenticated; `403` not member / self-DM; `404` group missing.

Response:

```json
{
  "conversationId": "<uuid>",
  "type": "DM",
  "groupId": "<uuid>",
  "title": null
}
```

### 6.3 Internal routes

Keep `/internal/conversations/ensure-group`, `ensure-task`, `remove-member`, `ingest-external` unchanged for core/task/google-sync.

## 7. Frontend UX

On conversation list (sidebar ≥800px, or full list on narrow when nothing selected):

1. Header row: label + **`+`** `IconButton` (disabled when no selected group; tooltip «Chọn workspace trước»).
2. Tap `+` → bottom sheet (`AppBottomSheet` / existing pattern):
   - Row **Cả nhóm**
   - Divider
   - Members of current group except current user (name / email via `CoreRepository.getGroup`).
3. On select → close sheet → call ensure → refresh list → set `selected` → thread opens (existing `ChatListBloc` → `ChatThreadBloc` listener).
4. List sections order: **NHÓM** → **TIN NHẮN** (DMs) → **THEO TASK**.
5. Busy: brief disable/`busy` on create; failures → snackbar.

## 8. Frontend data flow

- `ChatRepository.ensureGroupChat(groupId)`, `ensureDm(groupId, peerUserId)`.
- `ChatListReady.dmConversations` filtered `type == 'DM' && groupId == selectedGroup`.
- Events: `ChatListCreateGroupRequested`, `ChatListCreateDmRequested(peerUserId)`.
- Current user id from `AuthBloc` for picker exclusion and DM title resolution.
- Member list loaded when opening the sheet (independent of Home tab state).

## 9. Error handling

| Case | Behavior |
|------|----------|
| No group selected | `+` disabled |
| Not a member / peer not member | 403 → snackbar |
| Self as peer | Rejected client-side and server-side |
| Network / 5xx | Snackbar; list unchanged |
| Duplicate create race | Server returns existing conversation |

## 10. Testing

Backend:

- ensure-group twice → same `conversationId`.
- ensure-dm create then again → same id; members length 2.
- Reject self-DM and non-member.

Frontend (manual smoke acceptable for v1):

- `+` disabled without workspace.
- «Cả nhóm» and pick member each open the right thread and appear under the correct section.

## 11. Out of scope follow-ups

- Multi-member custom chats.
- Global DM directory.
- Create task thread from `+`.
- Rich presence / last message preview in list.
