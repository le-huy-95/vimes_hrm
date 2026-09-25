# Phase 6 Design — Internal Chat (Socket.IO)

**Date:** 2026-09-25  
**Status:** Approved; implementing  
**Depends on:** Phase 1 (JWT/teams), Phase 5 (optional file_id on messages)  
**Scope:** **A** — API + Socket.IO only; team channels; no web UI; no DM/project channels

---

## 1. Goals

- One default **team** channel per team (auto-create on first access / team create).
- REST: list channels for team, list messages (cursor/`after`), create message (also usable without socket).
- Socket.IO on same HTTP server: JWT in handshake (`auth.token` or `Authorization`).
- Events: `join_channel`, `send_message`, `new_message`, `typing`, `mark_read`.
- Write-then-broadcast: persist message then `io.to(channel:{id}).emit('new_message')`.
- Redis adapter (`@socket.io/redis-adapter` + ioredis duplicate) for multi-instance.
- Online presence: Redis key `user:online:{userId}` TTL 30s, refresh on heartbeat/`ping`.
- `message_read_status` for mark_read.
- Optional `attachment_file_id` on message (must be confirmed File in same org).

## 2. Non-goals

- Web chat UI.
- DM / project channels.
- Google Chat bridge (Phase 8–10).
- Message edit/delete (YAGNI Phase 6).

## 3. Data model

```
channels (id, team_id, project_id NULL, name, type: team|project|direct)
channel_members (id, channel_id, user_id)  -- Phase 6: all team members may join team channel without explicit row; optional sync on join
messages (id, channel_id, sender_id, content, attachment_file_id?, reply_to_id?, created_at)
message_read_status (id, message_id, user_id, read_at) UNIQUE(message_id, user_id)
```

Phase 6: `type=team` only; `UNIQUE(team_id)` where type=team (one default channel).  
Ensure channel on `GET /teams/:teamId/channels` (upsert default "general").

Membership check: user must be `team_members` of channel.team_id.

## 4. HTTP API

| Method | Path | Auth |
|--------|------|------|
| GET | `/teams/:teamId/channels` | team:view — ensure default |
| GET | `/teams/:teamId/channels/:channelId/messages?after=&before=&take=` | team:view |
| POST | `/teams/:teamId/channels/:channelId/messages` | team:view (any member can chat) |

Body send: `{ content, attachmentFileId?, replyToId? }`

## 5. Socket.IO

- Path `/socket.io`
- Handshake: verify access JWT → `socket.data.user`
- `join_channel` { channelId }: authorize team membership → `socket.join('channel:'+id)`
- `send_message` { channelId, content, ... }: same as REST then emit
- `typing` { channelId }: broadcast to room except sender
- `mark_read` { channelId, messageId }: upsert read status
- Presence heartbeat every 25s from client optional; server sets online on connect

CORS: `WEB_ORIGIN` credentials true.

## 6. Code layout

```
src/lib/socket.ts              # createIo(server), redis adapter
src/socket/chat.handlers.ts
src/repositories/channel.repository.ts
src/repositories/message.repository.ts
src/services/chat.service.ts
src/controllers/chat.controller.ts
src/routes/ — mount under teams
src/index.ts — attach io to http.Server
```

Packages: `socket.io`, `@socket.io/redis-adapter` (ioredis already present — use ioredis adapter if available, or `redis` package; prefer `@socket.io/redis-adapter` with ioredis via official pattern).

Note: `@socket.io/redis-adapter` v8+ often uses `redis` package. Use ioredis: check docs — can pass `pubClient`/`subClient` from `ioredis` in recent versions, or install `redis`. Prefer installing `socket.io` + `@socket.io/redis-adapter` + use existing ioredis if supported; else add `redis` package for pub/sub only.

## 7. Decisions

| Decision | Choice |
|----------|--------|
| Scope | A |
| Channel types | team only |
| UI | none |
| Adapter | Redis |
| Chat permission | any team member (team:view) |

---

*End of Phase 6 design.*
