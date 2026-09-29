# Create chat button (group + DM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Chat-tab `+` to ensure/open group chat or group-scoped 1-1 DM via public idempotent APIs.

**Architecture:** chat-service exposes JWT `POST /conversations/ensure-group` and `ensure-dm` (membership via Prisma `group_members`); unique `dm_pair_key` per group; Flutter sheet picks «Cả nhóm» or a member, then refreshes/selects conversation.

**Tech Stack:** Prisma/SQL migrations, Express/TS chat-service, Vitest, Flutter Bloc/Dio

**Spec:** `docs/superpowers/specs/2026-09-29-create-chat-button-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/packages/db/src/migrations.ts` | `013_dm_pair_key` |
| `backend/packages/db/prisma/schema.prisma` | `Conversation.dmPairKey` |
| `backend/apps/chat-service/.../dm-pair.ts` | Pure `buildDmPairKey` |
| `backend/apps/chat-service/tests/dm-pair.test.ts` | Pair key tests |
| `backend/apps/chat-service/.../conversation.schemas.ts` | Public ensure schemas |
| `backend/apps/chat-service/.../conversation.*.port.ts` + `prisma.repo.ts` | DM find/create + list group member ids |
| `backend/apps/chat-service/.../conversation.service.ts` | Public ensure group/DM |
| `backend/apps/chat-service/.../conversation.controller.ts` + `routes.ts` | Public routes |
| `frontend/.../chat_repository.dart` | ensure APIs |
| `frontend/.../chat_list_*` | Events/state/bloc + dm list |
| `frontend/.../chat_tab_page.dart` | `+` button + create sheet |

---

### Task 1: DB — dm_pair_key

**Files:**
- Modify: `backend/packages/db/src/migrations.ts`
- Modify: `backend/packages/db/prisma/schema.prisma`

- [x] **Step 1:** Migration `013_dm_pair_key` — add column + unique index on `(group_id, dm_pair_key)` for `type = 'DM'`
- [x] **Step 2:** Prisma `dmPairKey String? @map("dm_pair_key")`
- [x] **Step 3:** `cd backend/packages/db && npm run migrate && npm run prisma:generate`

---

### Task 2: dmPairKey helper (TDD)

**Files:**
- Create: `backend/apps/chat-service/src/modules/conversation/dm-pair.ts`
- Create: `backend/apps/chat-service/tests/dm-pair.test.ts`

- [x] **Step 1:** Failing tests — sorted uuid pair, order-independent, rejects equal ids
- [x] **Step 2:** Implement `buildDmPairKey(a, b)`
- [x] **Step 3:** Run `cd backend/apps/chat-service && npm test` (or vitest for that file)

---

### Task 3: Public ensure APIs

**Files:**
- Modify: schemas, ports, prisma.repo, service, controller, routes

- [x] **Step 1:** Schemas `EnsureGroupPublicSchema` `{ groupId }`, `EnsureDmPublicSchema` `{ groupId, peerUserId }`
- [x] **Step 2:** Repo: `findDmConversation(groupId, dmPairKey)`, `createDmConversation(...)`, `listActiveGroupMemberIds(groupId)`, `isActiveGroupMember(groupId, userId)`
- [x] **Step 3:** Service `ensureGroupConversationForUser(userId, groupId)`, `ensureDmConversationForUser(userId, groupId, peerUserId)` with membership checks
- [x] **Step 4:** Routes `POST /conversations/ensure-group`, `POST /conversations/ensure-dm` (JWT via requireUser)
- [x] **Step 5:** Keep internal routes unchanged

---

### Task 4: Flutter repository + bloc

**Files:**
- Modify: `chat_repository.dart`, `chat_list_event/state/bloc.dart`

- [x] **Step 1:** `ensureGroupChat`, `ensureDm` returning conversation id (+ type)
- [x] **Step 2:** `dmConversations` on Ready; filter `type == 'DM'`
- [x] **Step 3:** Events create group/DM; handlers ensure → refresh → select; optional `creating` busy flag
- [x] **Step 4:** Pass `currentUserId` into ChatListBloc from router (AuthAuthenticated)

---

### Task 5: Flutter UI

**Files:**
- Modify: `chat_tab_page.dart`

- [x] **Step 1:** Header + `+` on conversation list
- [x] **Step 2:** Sheet: Cả nhóm + members (from `CoreRepository.getGroup`, exclude self)
- [x] **Step 3:** Section **TIN NHẮN**; DM title from peer name when possible
- [x] **Step 4:** Manual smoke or analyze

---

### Task 6: Verify

- [x] chat-service vitest green
- [x] `dart analyze` on touched Flutter files (or flutter analyze scoped)
- [ ] Stop — ask user to commit if desired
