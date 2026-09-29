# Google Chat OAuth proxy (group-scoped)

**Date:** 2026-09-29  
**Spec:** `docs/superpowers/specs/2026-09-29-google-chat-oauth-proxy-design.md`

## Overview

Chat tab uses **Google Chat API** with the user’s OAuth refresh token. Spaces are **linked per group** in `google_chat_spaces`. Tasks created from chat use core `POST /groups/:groupId/tasks` (Google Tasks push unchanged).

## OAuth scopes (Flutter + Google Cloud consent)

- `https://www.googleapis.com/auth/tasks`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/chat.spaces.readonly`
- `https://www.googleapis.com/auth/chat.messages`
- `https://www.googleapis.com/auth/chat.memberships`

Users who linked Google before this feature must **re-consent** (Link Google page).

## JWT API (gateway → google-sync-service)

| Method | Path |
|--------|------|
| GET | `/sync/chat/readiness` |
| GET | `/sync/chat/spaces` |
| GET | `/sync/chat/links?groupId=` |
| POST | `/sync/chat/links` `{ groupId, spaceName, displayName?, spaceType? }` — OWNER/ADMIN |
| DELETE | `/sync/chat/links/:id` — OWNER/ADMIN |
| GET | `/sync/chat/spaces/:spaceName/messages?groupId=&pageToken=` |
| POST | `/sync/chat/spaces/:spaceName/messages` `{ groupId, text }` |

`:spaceName` is URL-encoded (`spaces%2FAAAA...`).

## Internal

| Method | Path | Body |
|--------|------|------|
| POST | `/internal/google-chat/leave-linked` | `{ userId, groupId }` + `x-internal-token` |

Called from core `POST /groups/:groupId/leave`.

## Readiness responses

- `{ "status": "ready" }`
- `{ "status": "needs_reconsent", "reason": "..." }`
- `{ "status": "chat_disabled", "reason": "..." }`
- `{ "status": "error", "reason": "..." }`

## Dev smoke

```bash
export JWT=...
curl -s -H "Authorization: Bearer $JWT" http://localhost:3000/sync/chat/readiness | jq
curl -s -H "Authorization: Bearer $JWT" "http://localhost:3000/sync/chat/links?groupId=<uuid>" | jq
```

## Leave group

`POST /groups/:groupId/leave` → membership REMOVED + best-effort Chat membership delete for all spaces linked to that group. Sole OWNER cannot leave (`SOLE_OWNER` 400).
