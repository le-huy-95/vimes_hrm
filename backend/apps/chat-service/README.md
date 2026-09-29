# chat-service

**Port:** `3204`  
**Mục đích:** Hội thoại nhóm/task (REST) + realtime Socket.IO.

## Modules

| Phần | Mục đích |
|------|----------|
| `modules/conversation` | REST list/send/edit/delete; mark read; internal ensure group/task |
| `realtime/socket.ts` | Socket.IO + Redis adapter (join, typing, auth:refresh, presence) |
| `infra/message-cache.ts` | Redis last-N (`cache:conv:*:lastn`) |
| `middlewares/rate-limit.ts` | Rate-limit gửi tin (`CHAT_RATE_LIMIT_PER_MIN`) + reaction (`CHAT_REACTION_RATE_LIMIT_PER_MIN`) |
| `modules/push/` | Device token + enqueue `push_jobs` (worker stub) |
| `modules/file/mime-sniff.ts` | Magic MIME chặn HTML/SVG |

## API

- `GET /conversations`
- `GET /conversations/:id/messages?after_seq=` — bù reconnect; after_seq=0 dùng last-N cache
- `POST /conversations/:id/messages` — `clientMsgId` idempotent
- `POST /conversations/:id/read` — `{ seq }`
- `PATCH|DELETE /conversations/:id/messages/:messageId`

## Socket events

- Client → `join` / `leave` / `typing` / `auth:refresh`
- Server → `message:new` / `message:edited` / `message:deleted` / `typing`

Gateway proxy: `/conversations`. Client Socket: `SOCKET_*_URL` → `:3204`.
