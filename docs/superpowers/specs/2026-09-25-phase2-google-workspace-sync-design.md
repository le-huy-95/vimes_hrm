# Phase 2 Design — Google Workspace Directory Sync

**Date:** 2026-09-25  
**Status:** Approved; implementation plan next  
**Depends on:** Phase 1 foundation (auth, org, teams, RBAC, MVC layered API)  
**Source:** `/Users/huy/Downloads/ke-hoach-tich-hop-he-thong.md` §4 + Phase 1 roadmap  
**Primary repo:** `manage-teams` (API)

---

## 1. Goals & non-goals

### Goals (Phase 2 done when)

- Org có thể đồng bộ danh sách nhân sự từ Google Workspace Directory (Admin SDK).
- Auth Admin SDK theo **hướng C**: Service Account + domain-wide delegation nếu cấu hình đủ; không thì fallback OAuth của Workspace admin (scope Directory riêng).
- Sync chạy **bất đồng bộ** qua BullMQ + Redis; có lock per-org chống job chồng.
- Upsert vào `google_workspace_sync`; link/tạo `users` trong cùng org theo email / `google_user_id`.
- Có API trigger sync, xem status, logs, danh sách user đã sync, list groups, map group → team.
- Thiết kế **tối ưu cho org lớn**: incremental `syncToken`, paginate, bulk upsert, không N+1, không tải cả directory vào RAM.
- Avatar: chỉ lưu `photo_url` (không download file — Storage ở Phase 5).
- Code theo MVC hiện tại (Router → Controller → Service → Repository) + `src/workers/` tách sẵn.

### Non-goals (explicitly deferred)

- Download/upload avatar vào MinIO/S3 (Phase 5).
- **Auto-add / auto-remove `team_members` từ Google Group** (Phase 2.1+; Phase 2 chỉ map + đọc).
- GitHub, Task/Project, Chat, Google Chat bot.
- Tách worker process riêng trong production deploy (cấu trúc code sẵn; runtime Phase 2 có thể cùng process API).
- UI web đầy đủ cho sync (API-first; web có thể thêm sau hoặc stub tối thiểu ngoài scope bắt buộc).

---

## 2. Auth model (Admin SDK)

### Priority order

1. **Service Account (preferred)**  
   - Env: `GOOGLE_SERVICE_ACCOUNT_JSON` (JSON string hoặc path), `GOOGLE_WORKSPACE_ADMIN_EMAIL` (subject để impersonate).  
   - Scopes: `admin.directory.user.readonly`, `admin.directory.group.readonly`.  
   - Domain-wide delegation đã bật trên Workspace.

2. **OAuth admin fallback**  
   - **Không** dùng token login thường (`openid email profile`).  
   - Flow riêng: **Connect Workspace Admin** — incremental OAuth / consent với Directory scopes; lưu vào `oauth_connections` (provider `google` hoặc provider riêng `google_workspace` nếu cần tách scope).  
   - Chỉ user có quyền `org:google-sync` mới connect được.

3. **Neither configured** → API trả `503` với message hướng dẫn cấu hình SA hoặc Connect Workspace.

### Decision

Approach **C** as approved: try SA first per request/job; else use org’s stored Workspace admin OAuth tokens.

---

## 3. Data model

### 3.1 `org_workspace_settings` (per org)

| Column | Purpose |
|--------|---------|
| `org_id` (PK/FK) | Tenant key |
| `directory_sync_token` | Admin SDK users.list syncToken (incremental) |
| `last_full_sync_at` | Timestamp last successful full sync |
| `last_incremental_sync_at` | Timestamp last successful incremental sync |
| `auth_mode` | `service_account` \| `oauth_admin` \| `none` (resolved at runtime also) |
| `sync_cursor_page_token` | Optional resume cursor if full sync interrupted |
| `updated_at` | |

### 3.2 `google_workspace_sync`

| Column | Purpose |
|--------|---------|
| `id` | PK |
| `org_id` | FK organizations |
| `google_user_id` | Directory user id |
| `primary_email` | |
| `full_name` | |
| `org_unit` | orgUnitPath |
| `photo_url` | Thumbnail URL from Google (nullable); **no binary** |
| `suspended` | bool from Directory |
| `linked_user_id` | FK users nullable |
| `content_hash` | Short hash of synced fields — skip UPDATE if unchanged |
| `last_synced_at` | |
| **UNIQUE** `(org_id, google_user_id)` | Dedup / upsert key |
| INDEX `(org_id, primary_email)` | |
| INDEX `(org_id, last_synced_at)` | |

### 3.3 `google_group_team_maps`

| Column | Purpose |
|--------|---------|
| `id` | PK |
| `org_id` | |
| `google_group_id` | |
| `google_group_email` | |
| `team_id` | FK teams |
| **UNIQUE** `(org_id, google_group_id)` | |
| **UNIQUE** `(org_id, team_id)` optional? | One team ↔ one primary group preferred; allow multiple groups → same team if needed (UNIQUE only on group) |

Phase 2: unique on `(org_id, google_group_id)` only; multiple groups may map to same team.

### 3.4 `sync_logs`

| Column | Purpose |
|--------|---------|
| `id` | PK |
| `org_id` | |
| `provider` | `google_workspace` |
| `entity_type` | `directory_users` \| `directory_groups` |
| `status` | `running` \| `success` \| `partial` \| `failed` |
| `error_message` | Truncated |
| `meta` | JSON counters only (see §5 Observability) — **no full user payloads** |
| `run_at` | |
| INDEX `(org_id, run_at DESC)` | |

Retention: delete or archive logs older than **90 days** (job nhẹ hoặc manual Phase 2; document intent).

### 3.5 Users linkage rules

- Match existing `users` in **same org** by `google_user_id` then `email` (case-insensitive).
- If email exists in **another org** → skip link, log conflict in `meta.conflicts` (sample, capped).
- New Directory user → create `users` with `status: invited`, `password_hash: null`, set `google_user_id`.
- Google `suspended: true` → set linked user `status: disabled` (do not hard-delete).
- Do not delete local users solely because missing from a single incremental page.

---

## 4. Sync engine & performance

### 4.1 Queue

- Redis + BullMQ queue name: `google-workspace-sync`.
- `jobId = google-workspace-sync:{orgId}` — coalesce duplicate enqueues.
- Repeatable cron per org (default every 6h; env `GOOGLE_WORKSPACE_SYNC_CRON`).
- Manual `POST` also enqueues same jobId.
- Worker concurrency: multiple orgs OK; **at most one active job per org** enforced by Redis lock.

### 4.2 Distributed lock

```
SET lock:sync:google-workspace:{orgId} NX EX 600
```

If lock not acquired → skip / log “already running”. Lock TTL 10 minutes; extend (heartbeat) if sync still running for very large orgs.

### 4.3 Incremental vs full

1. If `directory_sync_token` present → `users.list` with `syncToken` (delta).
2. On invalid/expired token → one **full sync**, store new token, clear resume cursor.
3. Full sync: paginate with `pageToken`; persist `sync_cursor_page_token` periodically so crash can resume (circuit: on repeated failure mark `partial`).

### 4.4 Page processing (no full-directory RAM)

- Page size ~200–500 (Google max constraints apply).
- Per page: map DTOs → compute `content_hash` → **bulk upsert** `google_workspace_sync` (`INSERT … ON CONFLICT DO UPDATE`, skip when hash equal where possible).
- Batch load local users: `WHERE org_id = ? AND (email IN (…) OR google_user_id IN (…))` — one query per page.
- Link / create users in same batch transaction or chunked transactions (100–200 rows).
- Then fetch next `pageToken`.

### 4.5 Rate limits & retries

- BullMQ attempts with exponential backoff on 429/5xx.
- Queue-level limiter (e.g. max N jobs/minute globally) to protect Google quotas when many orgs.
- Do not hammer Directory on permanent 403 (missing scope/SA) — fail fast, clear running log.

### 4.6 Groups (lazy)

- Cron/user sync **users** is primary path.
- Groups: list paginated on demand or lightweight refresh; **cache** list in Redis TTL 5–15 minutes for `GET /google-groups`.
- Group **members** fetched only when admin opens a group or maps it — not every user sync.
- **No** automatic `team_members` mutation in Phase 2.

### 4.7 Avatars

- Persist `photo_url` string only.
- No HTTP download of images in sync worker.

### 4.8 Process layout

```
src/workers/google-workspace.worker.ts  # BullMQ processor
src/lib/google-directory.client.ts      # Admin SDK wrapper (SA | OAuth)
src/services/workspace-sync.service.ts
src/repositories/workspace-*.repository.ts
src/controllers/workspace-sync.controller.ts
src/routes/workspace.routes.ts
```

Phase 2: start worker from `index.ts` alongside HTTP. Code must allow later `node dist/worker.js` without HTTP.

---

## 5. API surface

All routes require `authenticateJWT` and `user.orgId` scoping.

### Authorization

| Action | Who |
|--------|-----|
| Connect Workspace, trigger sync, map/unmap group↔team | Org member **and** (deployment has SA configured **or** caller already has Workspace Directory OAuth tokens / is performing connect) |
| Read status, logs, synced users, groups | Any authenticated member of the org |

Finer `org:admin` role can replace this later without changing routes.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/orgs/me/workspace/auth-status` | SA configured? OAuth connected? |
| `GET` | `/orgs/me/workspace/connect` | Start OAuth admin consent (redirect) |
| `GET` | `/orgs/me/workspace/connect/callback` | OAuth callback; store encrypted tokens |
| `POST` | `/orgs/me/google-sync` | Enqueue sync now |
| `GET` | `/orgs/me/google-sync/status` | Last log + lock held? + settings timestamps |
| `GET` | `/orgs/me/google-sync/logs` | Paginated sync_logs |
| `GET` | `/orgs/me/google-sync/users` | Paginated google_workspace_sync |
| `GET` | `/orgs/me/google-groups` | Cached/list groups |
| `PUT` | `/orgs/me/google-groups/:groupEmail/team` | Map group → teamId |
| `DELETE` | `/orgs/me/google-groups/:groupEmail/team` | Unmap |

OpenAPI updated for these paths.

### Observability `meta` example

```json
{
  "mode": "incremental",
  "pages": 12,
  "upserted": 180,
  "linked": 20,
  "createdUsers": 5,
  "skippedUnchanged": 150,
  "conflicts": 1,
  "durationMs": 4200,
  "apiCalls": 14
}
```

---

## 6. Configuration (`.env.example`)

```
REDIS_URL=redis://localhost:6379
GOOGLE_SERVICE_ACCOUNT_JSON=
GOOGLE_WORKSPACE_ADMIN_EMAIL=
GOOGLE_WORKSPACE_SYNC_CRON=0 */6 * * *
GOOGLE_WORKSPACE_CONNECT_CALLBACK_URL=http://localhost:3002/orgs/me/workspace/connect/callback
```

Existing Google web client id/secret reused for Connect Workspace OAuth where possible; additional scopes requested on that flow.

---

## 7. Security

- Directory tokens encrypted at rest (same AES helper as Phase 1 oauth).
- No Directory payloads in logs beyond counters + capped conflict samples.
- CORS unchanged; Connect callback locked to API origin.
- Audit log optional on map group↔team and manual sync trigger (`action: workspace.sync.enqueue`).

---

## 8. Testing strategy

- Unit: page mapper + content_hash skip logic; lock acquire/skip.
- Integration (test DB + Redis): enqueue → worker upserts batch; incremental path with mocked Directory client.
- Manual: SA or OAuth against a real Workspace test domain when credentials available.
- Failure cases: 403 missing scope, 429 backoff, expired syncToken → full sync.

---

## 9. Decisions log

| Decision | Choice |
|----------|--------|
| Admin auth | C — SA first, OAuth admin fallback |
| Auto team membership from Groups | **No** in Phase 2 |
| Avatar binary | Defer Phase 5; store `photo_url` only |
| Sync execution | BullMQ async + Redis lock per org |
| Large-org performance | Incremental syncToken + paginated bulk upsert |
| Connect Workspace | Separate OAuth flow with Directory scopes |
| Worker process | Same process Phase 2; `src/workers/` isolatable |

---

## 10. Four approved tightenings (from design review)

1. No auto-mutate `team_members` from Groups in Phase 2.  
2. Persist sync state in `org_workspace_settings` (`directory_sync_token`, timestamps, auth hints, resume cursor).  
3. Dedicated **Connect Workspace** OAuth for Directory scopes.  
4. Privilege gate for trigger/connect/map; read status available to org members.

---

*End of Phase 2 Google Workspace Directory Sync design.*
