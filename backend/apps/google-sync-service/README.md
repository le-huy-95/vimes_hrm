# google-sync-service

**Port:** `3207`  
**Phases:** 2/2.5 Tasks · 3/3.5 Chat · **4 Sheets** · **5 metrics/DLQ** · Sheets stub→matrix

Chi tiết Phase 4–5: [docs/runbooks/phase-4-5-deepen.md](../../docs/runbooks/phase-4-5-deepen.md)

| Method | Path | Auth |
|--------|------|------|
| POST | `/internal/sync/tasks/push` | internal |
| POST | `/internal/sync/tasks/delete` | internal |
| POST | `/internal/sync/tasks/pull` | internal |
| POST | `/internal/sync/reconcile` | internal |
| POST | `/sync/tasks/pull` | JWT |
| POST | `/sync/tasks/full` | JWT |
| GET | `/sync/status` | JWT |
| POST | `/google-chat/webhook` | verification token (public gateway) |
| POST | `/internal/google-chat/events` | internal / token |
| POST | `/internal/google-chat/spaces/register` | internal |
| POST | `/internal/google-chat/ingest` | internal |
| POST | `/internal/sync/sheets` | internal (PUSH debounce ~45s) |
| GET | `/sync/sheets/:groupId` | JWT |
| POST | `/sync/sheets/:groupId/ensure` | JWT |
| POST | `/sync/sheets/:groupId/push` | JWT |
| POST | `/sync/sheets/:groupId/pull` | JWT |
| POST | `/drive/webhook` | channel token (public) |
| POST | `/internal/sync/dlq/replay` | internal |
| GET | `/metrics` | public (Prometheus) |

Chi tiết: [phase-4-5](../../docs/runbooks/phase-4-5-deepen.md) · [phase-2-3](../../docs/runbooks/phase-2-3-3.5-deepen.md) · ADR [0002](../../docs/adr/0002-google-chat-spike.md)
