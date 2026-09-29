# Deepen Phase 2 / 2.5 / 3 / 3.5

**Date:** 2026-09-28

## Phase 2 / 2.5 (Tasks)

| Tính năng | API / hành vi |
|-----------|----------------|
| Debounce + dedupe + CREATING + partial PATCH | Đã có |
| Access token cache + DLQ FAILED | Đã có |
| Reconcile định kỳ | Worker mỗi `GOOGLE_TASKS_RECONCILE_MS` + `POST /internal/sync/reconcile` |
| Full sync | `POST /sync/tasks/full` (JWT) |
| Status | `GET /sync/status` |
| Notes split personal / `[app:uuid]` | Push compose + pull cập nhật `personalNote` |
| Completion theo timestamp | Newer wins |
| `google.signals` | Ghi `outbox` topic `google.signals` |
| Background poll | Giãn dần 5→60 phút |

## Phase 3 (Chat bot)

| Tính năng | API |
|-----------|-----|
| Webhook Google | `POST /google-chat/webhook` (public) |
| Internal events | `POST /internal/google-chat/events` |
| Slash `/complete CODE` | Parse → COMPLETE_TASK |
| Card click | Parse CARD_CLICKED |
| AI ask | `/ask` hoặc ASK_BOT |
| Email fallback | Worker khi fail + fallbackEmail |
| ADR | `docs/adr/0002-google-chat-spike.md` |

## Phase 3.5 (Bridge)

| Tính năng | API |
|-----------|-----|
| Register space | `POST /internal/google-chat/spaces/register` |
| Ingest Google→app | `POST /internal/google-chat/ingest` |
| Egress app→Google | `POST /internal/google-chat/egress` (stub trừ khi `GOOGLE_CHAT_EGRESS_ENABLED=true`) |
| Watch renew | `POST /internal/google-chat/watch/renew` |

## Cấu hình env (nhắc)

```bash
GOOGLE_CLIENT_ID=...          # Web client — phải khớp Flutter GOOGLE_SERVER_CLIENT_ID
GOOGLE_CLIENT_SECRET=...      # Secret thật, không phải placeholder
GOOGLE_TOKEN_ENCRYPTION_KEY=...
GOOGLE_CHAT_VERIFICATION_TOKEN=dev-google-chat-verification
GOOGLE_SYNC_URL=http://localhost:3207
```

## Chưa làm (production)

- JWT Google Chat thật, Chat service account egress
- Kafka consumer cho `google.signals`
- Due date field (schema chưa có)
- Flutter UI nút “Đồng bộ đầy đủ”
