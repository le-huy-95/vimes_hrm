# Deepen Phase 4 (Sheets) + Phase 5 (hardening)

**Date:** 2026-09-28  
**Phase 6a:** xem [phase-6a-deepen.md](./phase-6a-deepen.md)

## Phase 4 — Google Sheets

| Tính năng | Chi tiết |
|-----------|----------|
| Matrix task→sheet | Cột `code,title,status,personal_note,assignee_user_id` |
| Writable columns | Mặc định chỉ `status`, `personal_note` (title/code protected) |
| Debounce push | `GOOGLE_SHEETS_DEBOUNCE_MS` (mặc định 45s) |
| Push (local) | Matrix + `row_hashes` / `contentHash` (idempotent) |
| Push (LIVE) | `GOOGLE_SHEETS_LIVE=true` → Sheets API create/update + protect cột A–B |
| Pull | Chỉ áp writable; so hash từng dòng; LIVE dùng `values.get` |
| Drive watch | `drive_watch_channels` + `POST /internal/sync/drive/watch` + `POST /drive/webhook` |
| Ensure / status | `POST /internal/sync/sheets/ensure`, `GET /sync/sheets/:groupId` |
| OAuth scopes | `spreadsheets` + `drive.file` (identity + Flutter) |

Migration: `010_phase4_5_sheets_hardening`

## Phase 5 — Củng cố

| Tính năng | Chi tiết |
|-----------|----------|
| Metrics | `GET :3207/metrics` (Prometheus) + backlog sync_jobs + otel-lite |
| Ops JSON | `GET /internal/sync/ops` |
| Quota alert | `google_sync_quota_alert` khi 429 cao |
| DLQ replay | `POST /internal/sync/dlq/replay` — FAILED→RETRY; worker `topic=sync_jobs` proxy |
| Load mock | `scripts/load-test-google-mock.ts` — ước lượng user vs 50k Tasks/ngày |
| Backup | `pnpm backup:postgres` → `scripts/backup-postgres.sh` |
| Security | `pnpm security:env-check` (+ CI step) |
| Runbook | `incident-basics.md` + file này |
| Health | google-sync `/health` kèm google metrics |

## Bật LIVE Sheets

```bash
# backend/.env
GOOGLE_SHEETS_LIVE=true
GOOGLE_DRIVE_WEBHOOK_URL=https://<public-host>/drive/webhook
# User phải re-login Google để có scope spreadsheets + drive.file
```

## API nhanh

```bash
# Sheets push (debounce)
curl -X POST :3207/internal/sync/sheets \
  -H "x-internal-token: $INTERNAL" -H 'content-type: application/json' \
  -d '{"userId":"...","groupId":"...","direction":"PUSH"}'

# Drive webhook giả
curl -X POST :3200/drive/webhook \
  -H "x-goog-channel-id: ch-..." -H "x-goog-channel-token: ..."

# DLQ
curl -X POST :3206/internal/dlq/replay \
  -H "x-internal-token: $INTERNAL" -d '{"topic":"sync_jobs","limit":10}'

# Metrics
curl :3207/metrics
```

## Chưa làm (prod ops)

- OpenTelemetry SDK đầy đủ + Kafka lag dashboard
- Pen-test chuyên sâu / backup cron tự động trên cluster
- Protected range khi sheet đã share (editor có thể bypass warning-only trên một số case)
