# Design: Google Chat as sole group chat (User OAuth proxy)

**Date:** 2026-09-29  
**Status:** Approved — implementation plan next  
**Approach:** User OAuth proxy to Google Chat API (no in-app chat as product UX)

## Goal

After Google link/login, the user consents once to **Tasks + Sheets + Drive.file + Chat**. The app Chat tab shows **only Google Chat** conversations **linked to the current group**. From a chat thread, members can **create and assign tasks** via existing core `POST /groups/:groupId/tasks`, which already pushes to **Google Tasks** for assignees. Members can self-leave a group and are removed from linked Google Chat spaces when possible. Workspace and personal Gmail are both in scope, with a hard gate when Chat is unavailable.

## Non-goals (MVP)

- In-app / internal conversation storage as the primary chat UX
- Auto-creating a Google Chat “account” (only detect + guide enablement)
- Full parity (reactions, rich cards, file upload, threaded replies)
- Production Chat bot JWT / slash commands (existing spike remains deferred)
- Guaranteed realtime (MVP may poll)

## Decisions (approved)

| Topic | Decision |
|-------|----------|
| Chat source of truth | Google Chat only |
| Filter | By current group — only linked spaces/DMs |
| Empty group links | CTA → picker of all user Chat spaces (option D) |
| Who links/unlinks | OWNER / ADMIN |
| Who chats | All ACTIVE members with Google Chat ready |
| Self-leave group | Allowed (not sole OWNER without transfer) |
| Leave + Chat | Also remove user from linked Google Chat spaces (best-effort) |
| Account types | Workspace + personal Gmail |
| Architecture | User OAuth proxy via `google-sync-service` |
| Create task from Chat | Call core create-task API (assignees) → existing Google Tasks push |

## Architecture

```
Flutter Chat tab
    → API Gateway (JWT)
        → google-sync-service
            → Google Chat API (user access token from stored refresh)
            → Postgres: google_chat_spaces (group ↔ space links)
        → core-service
            → POST /groups/:groupId/tasks  (create + assign → Google Tasks sync)
            → POST /groups/:groupId/leave
            → then google-sync leave-spaces for that group
```

Sheets continue via existing Phase 4 sync paths; same OAuth consent bundle.

`chat-service` is **not** the UX source for group chat. Keep it only if needed for legacy/internal ingest; Flutter Chat tab must not depend on it for list/thread/send.

## 1. Auth & scopes

### Flutter / web GIS

Extend `kGoogleSyncScopes` in `frontend/lib/features/auth/data/google_sign_in_helper.dart` (and web popup) to include Chat scopes in addition to existing:

- `https://www.googleapis.com/auth/tasks`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/chat.spaces.readonly` (list spaces)
- `https://www.googleapis.com/auth/chat.messages` (read/send)
- `https://www.googleapis.com/auth/chat.memberships` (leave space)

Exact scope strings must be verified against current Google Chat OAuth docs at implementation time; if Google requires broader variants (`chat.spaces`, `chat.memberships.readonly`, etc.), prefer the minimal set that passes list/send/leave.

### Backend

- Existing identity Google token exchange stores refresh token covering the new scopes after re-consent.
- Users who linked Google before this change must **re-consent** before Chat works.

### Chat readiness gate

Before Chat tab content loads:

1. User has Google link + refresh token.
2. Token scopes include Chat (or probe list-spaces succeeds).
3. If API returns Chat-unavailable / not enabled for the account → **blocking screen**: explain enable Google Chat for that email, link to Google help, buttons “Retry” and “Open Google Chat”.
4. Missing scopes → force Google re-login / re-consent.

Do not invent a fake “create Chat account” flow inside the app.

## 2. Group ↔ space linking

### Data

Reuse / extend `GoogleChatSpace` (`google_chat_spaces`):

- `spaceName` (unique Google resource name, e.g. `spaces/AAAA...`)
- `groupId` (required for product links)
- `conversationId` — nullable / unused for UX (legacy bridge column may remain)
- `chatIngestEnabled` — unused for primary UX; leave default false or ignore
- Add if missing: `linkedByUserId`, `displayName` cache, `spaceType` (`SPACE` | `DM` | `GROUP_DM`)

One group may have **many** linked spaces.

### APIs (`google-sync-service`, JWT via gateway under `/sync/chat/...`)

| Method | Path | AuthZ | Behavior |
|--------|------|-------|----------|
| GET | `/sync/chat/readiness` | member | readiness + missing scopes / chat disabled |
| GET | `/sync/chat/spaces` | member + Chat ready | list user’s spaces/DMs from Google |
| GET | `/sync/chat/links?groupId=` | group member | links for group |
| POST | `/sync/chat/links` | OWNER/ADMIN | body `{ groupId, spaceName }` upsert link |
| DELETE | `/sync/chat/links/:id` | OWNER/ADMIN | remove DB link only (does not delete Google space) |

### UX

1. Chat tab scoped to selected `groupId`.
2. No links → empty state + CTA **“Liên kết Google Chat”** (ADMIN/OWNER); members see empty + “Chờ admin liên kết”.
3. Picker lists all Chat spaces for the signed-in email; already-linked marked.
4. After link, list shows only linked spaces (title / last message preview from Google).

## 3. Messages (read / send)

### APIs

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/sync/chat/spaces/:spaceName/messages` | history; `pageToken` passthrough |
| POST | `/sync/chat/spaces/:spaceName/messages` | send text body |

Authorization: caller must be ACTIVE group member **and** `spaceName` must be linked to that `groupId` (pass `groupId` query/body). Reject if user is not a Google member of the space (surface clear error).

### Realtime MVP

Polling (e.g. 5–15s on open thread) or pull-to-refresh. Socket.IO / `chat-service` is not the message bus for this UX.

### Flutter

Replace Chat tab data layer to call `/sync/chat/*` instead of internal conversations. Thread UI: list messages, composer sends text. Badge/copy clarifies Google Chat.

MVP media: text + URLs only.

### Create / assign task from Chat

**Product:** In a Google Chat thread (group context), any ACTIVE group member can open **“Thêm công việc”** and create a task assigned to one or more group members. Persistence and Google Tasks sync reuse the existing core path — **no new task write API**.

**API (existing):**

`POST /groups/:groupId/tasks` with body aligned to current `CreateTaskInput`:

- `title` (required)
- `description` (optional)
- `assigneeIds` (optional list of group member user ids — “giao việc”)
- `dueDate` (optional, date-only, same as Tasks tab)
- `completionMode`, `allowClaim`, `maxAssignees` — use same defaults as Tasks tab create

Core already:

1. Creates task + assignees in DB
2. `pushToAssignees` → Google Tasks for each assignee (requires their Google link + Tasks scope)
3. Outbox `TaskCreated`

**Flutter UX (Chat thread):**

1. Action on app bar / composer: **Thêm công việc**
2. Sheet/dialog: title, optional due, multi-select assignees from `GET /groups/:groupId` members
3. Submit → `POST /groups/:groupId/tasks`
4. On success: toast + deep link to task on Tasks tab; **always** post a short message into the **current Google Chat space** via `POST /sync/chat/spaces/:spaceName/messages` (e.g. “Đã tạo T-12: … → assignees”) so Chat history reflects the action. If announce fails, task still exists — show soft warning.

**Errors:**

- Assignee without Google link: task still created in app; Google Tasks push for that user fails/skips as today — surface in toast if sync reports AUTH_REQUIRED
- Empty title / non-member assignee: existing validation

**Out of scope for this add-on:** creating Google Tasks *only* without app task; editing task fully inside Chat (use Tasks tab).

## 4. Self-leave group (+ leave Chat spaces)

### Core API

`POST /groups/:groupId/leave` (JWT):

- Removes current user from group membership.
- Reject if user is the **sole OWNER** (must transfer ownership or delete group first).
- Then orchestrate Chat leave (sync call or internal):

For each linked `google_chat_spaces` row for `groupId`, call Google Chat membership delete for the current user (user token).

Response shape:

```json
{
  "leftGroup": true,
  "chatResults": [
    { "spaceName": "spaces/...", "ok": true },
    { "spaceName": "spaces/...", "ok": false, "error": "..." }
  ]
}
```

Group leave **succeeds** even if some Chat removals fail; Flutter shows which spaces remain.

### Admin kick

`DELETE /groups/:groupId/members/:userId` should attempt the same Chat leave using the **target user’s** refresh token when available; otherwise leave app membership only and optionally record `CHAT_LEAVE_PENDING`. Self-leave is the primary MVP path.

## 5. Sheets

No Chat-specific change. Login consent already includes Sheets + Drive.file. Existing ensure/push/pull/status per `groupId` remains.

## 6. Error handling

| Case | Behavior |
|------|----------|
| Missing Chat scopes | Re-consent |
| Chat not enabled | Blocking readiness UI |
| Not in Google space | Hide or error on open; admin may unlink |
| Google rate limit | Backoff + toast |
| Partial Chat leave failure | Group left; list residual spaces |

## 7. Testing

- Unit: link upsert/dedupe, leave orchestration (mock Google client), readiness classification.
- Integration: mocked Chat API for list/send/leave + authz (member vs admin).
- Flutter: empty CTA → picker → thread; create task from chat → assignees; leave group success/partial Chat failure.
- Regression: create task from Chat still triggers Google Tasks push for assignees (mock or status check).

## File touchpoints (expected)

- `frontend/lib/features/auth/data/google_sign_in_helper.dart` — scopes
- `frontend/lib/features/auth/data/google_web_popup_web.dart` — scopes
- `frontend/lib/features/chat/**` — Google Chat list/thread/link/leave + create-task sheet
- `frontend/lib/features/tasks/**` or shared core API client — reuse create-task client
- `backend/apps/google-sync-service/src/modules/chat/**` — real Chat API client + JWT routes
- `backend/apps/core-service/src/modules/group/**` — `POST .../leave` + Chat orchestration
- `backend/apps/core-service/src/modules/task/**` — reuse `createTask` (no new endpoint unless thin chat-notify helper)
- `backend/packages/db` — `GoogleChatSpace` fields if needed
- Gateway: ensure `/sync/chat` proxied (already under `/sync`)

## Migration / rollout

1. Ship scopes + readiness (old users re-login).
2. Ship links + list/send.
3. Ship create/assign task from Chat (core create + Chat announce message).
4. Ship self-leave + Chat membership remove.
5. Soft-deprecate Flutter dependence on internal chat conversations for group chat.
