# ADR 0002: Google Chat app spike (Phase 3) + bridge 3.5

**Status:** Accepted (dev deepen) — production Workspace verification vẫn TBD  
**Date:** 2026-09-28  
**Updated:** 2026-09-28 (deepen 3 / 3.5)

## Context

Phase 3 yêu cầu trả lời khả thi Google Chat trước bridge 3.5. Repo có chat-service + email worker + google-sync.

## Spike answers (interim)

| # | Câu hỏi | Quyết định tạm |
|---|---------|----------------|
| 1 | Chat / Events với Gmail cá nhân? | **Workspace-oriented**; personal → app + **email fallback** |
| 2 | Auth `chat.app.*` vs user OAuth? | Dev: shared `GOOGLE_CHAT_VERIFICATION_TOKEN`; prod: JWT Google Chat |
| 3 | File đính kèm bằng app auth? | Chưa — gửi link app |
| 4 | Scope / duyệt OAuth | TBD Workspace admin |
| 5 | Hạn mức | Dùng `google-limiter` |
| 6 | Timeout HTTP | Trả card đồng bộ `< 1s` |
| 7 | Tasks batch | Tách Phase 2/2.5 |

## Decision

### Phase 3
1. `POST /google-chat/webhook` (public qua gateway) + `POST /internal/google-chat/events`.
2. Parse MESSAGE (`/complete`, `/ask`) và CARD_CLICKED.
3. Dedupe `google_chat_event_dedupe`.
4. `COMPLETE_TASK` → core `/internal/tasks/complete` (`completedSource=chat`).
5. Email fallback qua worker khi complete fail + có `fallbackEmail`.

### Phase 3.5
1. `POST /internal/google-chat/spaces/register` — map space ↔ conversation.
2. Ingest Google → app (`origin=GOOGLE_CHAT`).
3. Egress app → Google stub (`GOOGLE_CHAT_EGRESS_ENABLED=true` mới gọi API thật).
4. Anti-loop: không egress tin `origin=GOOGLE_CHAT`.
5. Watch renew định kỳ.

## Consequences

- Dev giả lập card/slash không cần Google Workspace.
- Production cần Chat app credentials + JWT verify trước khi Accepted production.
