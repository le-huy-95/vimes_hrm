# Runbook — sự cố thường gặp (Phase 5)

## Services

| Port | Service |
|------|---------|
| 3200 | api-gateway |
| 3202 | identity |
| 3203 | core |
| 3204 | chat |
| 3205 | ai |
| 3206 | worker |
| 3207 | google-sync |

Infra: Postgres `:15432`, Redis `:16379`, Kafka `:9092`, MinIO `:9000`.

Gắn **`x-correlation-id`** khi mở ticket / đọc log.

## Triệu chứng → bước

### Gateway 502
1. `curl :3200/health`  
2. `lsof -iTCP:3202-3207`  
3. `./scripts/dev-start.sh`

### Prisma / DB
1. `DATABASE_URL` → `localhost:15432`  
2. `pnpm --filter @manage-teams/db migrate`

### Google Tasks AUTH_REQUIRED
1. Re-login Google (scope Tasks + serverAuthCode)  
2. `GOOGLE_TOKEN_ENCRYPTION_KEY` khớp  
3. `GET :3207/sync/status` · `sync_jobs.last_error`

### Google Sheets không cập nhật
1. Job `SHEETS_PUSH` / `SHEETS_PULL` trong `sync_jobs`  
2. Debounce ~45s — đợi hoặc xem `next_run_at`  
3. `GET :3207/sync/sheets/:groupId`  
4. Drive watch: channel hết hạn → đăng ký lại `/internal/sync/drive/watch`

### Chat file
1. MinIO + `MINIO_BUCKET`  
2. `GROUP_FILE_QUOTA_BYTES`  
3. Orphan `UPLOADING`

### DLQ / sync FAILED
```bash
curl -X POST http://localhost:3206/internal/dlq/replay \
  -H "x-internal-token: $INTERNAL_SERVICE_TOKEN" \
  -H "content-type: application/json" \
  -d '{"topic":"sync_jobs","limit":20}'
```
Hoặc trực tiếp `:3207/internal/sync/dlq/replay`.

### Quota Google (cảnh báo)
1. `curl :3207/metrics` — xem `google_sync_quota_alert`, `google_api_429_total`  
2. `GET :3207/internal/sync/ops` (internal token)  
3. Giảm poll / tăng debounce; mock: `tsx apps/google-sync-service/scripts/load-test-google-mock.ts`

## Backup / restore (tối thiểu)
1. `pnpm backup:postgres` (hoặc `./scripts/backup-postgres.sh`) — cần `pg_dump` + `DATABASE_URL`  
2. Không commit `.env` / encryption keys  
3. Sau restore: `migrate` + restart services  
4. Trước deploy: `pnpm security:env-check`

## Security checklist (Phase 5 tối giản)
- [ ] JWT secret không dùng default prod  
- [ ] `INTERNAL_SERVICE_TOKEN` đổi khỏi `dev-internal-token`  
- [ ] Google client secret đã xoay nếu lộ  
- [ ] Webhook Drive/Chat verify token  
- [ ] CORS allowlist không `*` trên prod  

## Escalation
Correlation-id + service + `sync_jobs.id` / `eventId`.
