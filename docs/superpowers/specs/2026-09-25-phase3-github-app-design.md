# Phase 3 Design — GitHub App + Webhook + BullMQ

**Date:** 2026-09-25  
**Status:** Implemented on branch `feature/phase3-github-app`  
**Depends on:** Phase 1 (teams/RBAC/MVC), Phase 2 (Redis + BullMQ patterns)  
**Primary repo:** `manage-teams` (API)  
**Scope choice:** **A** — GitHub infrastructure only; **no** Task/Project linking (`#task-<id>` deferred to Phase 4)

**Source:** `/Users/huy/Downloads/ke-hoach-tich-hop-he-thong.md` §5 + Phase 1 roadmap

---

## 1. Goals & non-goals

### Goals (Phase 3 done when)

- Team lead can start GitHub App installation bound to a `team_id`.
- System stores `github_connections` (`installation_id`, org slug, team).
- `POST /webhooks/github` verifies `X-Hub-Signature-256`, dedups `X-GitHub-Delivery`, returns quickly, enqueues BullMQ work.
- Worker upserts `github_repos` and records normalized `github_activity_events` for `push`, `pull_request`, `issues` (plus install lifecycle events).
- APIs: connection status, repos list, manual sync enqueue, paginated activity.
- Periodic/backup repo sync job per installation.
- Code follows existing MVC: Router → Controller → Service → Repository + `src/workers/`.

### Non-goals

- Creating/updating Tasks from `#task-<id>` (Phase 4).
- Full dashboard aggregation UI (Phase 7).
- GitHub OAuth App / personal PAT as primary auth (GitHub **App** only).
- Mirroring full PR/issue bodies or storing entire raw webhook payloads long-term.
- Web UI beyond optional stub (API-first; web can call APIs later).

---

## 2. Approach

**Chosen:** GitHub App + webhook-first (not PAT poll-only).

Rationale: matches source plan, short-lived installation tokens, realtime via webhooks, scales with BullMQ already in the stack.

---

## 3. Configuration

```env
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=          # PEM string or path to .pem
GITHUB_APP_SLUG=                 # for install URL https://github.com/apps/{slug}/installations/new
GITHUB_WEBHOOK_SECRET=
GITHUB_APP_INSTALL_CALLBACK_URL=http://localhost:3002/teams/github/install/callback
```

Optional later: GitHub App user-to-server OAuth for richer UX — not required if install URL + `installation` webhook + state cookie suffice.

---

## 4. Data model

### 4.1 `github_connections`

| Column | Notes |
|--------|--------|
| `id` | PK |
| `team_id` | FK teams, **UNIQUE** (one connection per team in Phase 3) |
| `org_id` | FK organizations (denormalized for auth checks) |
| `installation_id` | GitHub installation id, indexed |
| `github_account_login` | org or user login |
| `github_account_type` | `Organization` \| `User` |
| `github_team_id` | nullable (GitHub team id if mapped later) |
| `connected_by_user_id` | nullable |
| `created_at`, `updated_at` | |

Unique optional: `(installation_id, team_id)` — with team unique, one row per team is enough. Multiple teams sharing one installation is **out of scope** for Phase 3 (document: one install → one team; re-install to remap).

### 4.2 `github_repos`

| Column | Notes |
|--------|--------|
| `id` | PK |
| `team_id` | FK |
| `connection_id` | FK github_connections |
| `github_repo_id` | bigint/string |
| `full_name` | `owner/repo` |
| `default_branch` | nullable |
| `private` | bool |
| `html_url` | |
| `last_synced_at` | |
| **UNIQUE** `(team_id, github_repo_id)` | |
| INDEX `(team_id)` | |

### 4.3 `github_webhook_deliveries`

| Column | Notes |
|--------|--------|
| `id` | PK |
| `delivery_id` | **UNIQUE** (`X-GitHub-Delivery`) |
| `event` | `X-GitHub-Event` |
| `action` | nullable (payload.action) |
| `received_at` | |
| `processed_at` | nullable |
| `status` | `accepted` \| `processed` \| `ignored` \| `failed` |

### 4.4 `github_activity_events`

Normalized feed for `GET .../github/activity`:

| Column | Notes |
|--------|--------|
| `id` | PK |
| `team_id` | |
| `repo_id` | FK github_repos nullable if unknown yet |
| `event_type` | `push` \| `pull_request` \| `issues` \| `installation` … |
| `action` | nullable |
| `actor_login` | |
| `title` | short summary (PR title, issue title, ref for push) |
| `external_url` | |
| `occurred_at` | |
| `dedupe_key` | UNIQUE optional e.g. `delivery_id` or `pr:repoId:number:action` |
| `meta` | small JSON (additions/deletions counts, state) — **no full payload** |
| INDEX `(team_id, occurred_at DESC)` | |

---

## 5. Auth to GitHub API

- Build App JWT from `GITHUB_APP_ID` + private key (short-lived).
- Exchange for **installation access token** per `installation_id`.
- Cache token in Redis `github:install-token:{installationId}` with TTL = expires_at − skew (e.g. 60s early).

---

## 6. Connection / install flow

1. `GET /teams/:teamId/github/install-url` (JWT + `team:manage` or lead permission)  
   - Sign state `{ teamId, userId, nonce }` (HMAC or JWT).  
   - Set httpOnly cookie.  
   - Return `{ url: https://github.com/apps/{slug}/installations/new?state=... }`.

2. User installs App on GitHub → GitHub redirects to `GITHUB_APP_INSTALL_CALLBACK_URL` with `installation_id` + `state` (and/or sends `installation` webhook).

3. Callback handler (or webhook worker):  
   - Verify state.  
   - Upsert `github_connections` for `teamId`.  
   - Enqueue `github-sync-repos` for that installation.  
   - Redirect web `${WEB_ORIGIN}/teams/{teamId}?github=connected`.

4. `DELETE /teams/:teamId/github/connection` — delete connection; **CASCADE** delete related `github_repos`; set activity `repo_id` to **NULL** (giữ lịch sử).

---

## 7. Webhook pipeline

`POST /webhooks/github`:

1. Use **raw body** for signature verify (`express.json` verify callback or separate raw parser on this route only).
2. `X-Hub-Signature-256` = `sha256=` + HMAC-SHA256(secret, rawBody). Constant-time compare.
3. Missing/invalid signature → 401.
4. `delivery_id` insert; on unique violation → 200 `{ duplicate: true }`.
5. Enqueue job; respond **202** `{ accepted: true }`.

**Worker `github-webhook`:**

| Event | Behavior |
|-------|----------|
| `ping` | Mark delivery processed |
| `installation` created | If state/team known from pending map OR ignore until callback linked; if installation already mapped, sync repos |
| `installation` deleted | Delete/disable connection for installation_id |
| `installation_repositories` | Add/remove repos |
| `push` | Upsert repo if needed; insert activity |
| `pull_request` | Activity (opened/closed/merged/synchronize…) |
| `issues` | Activity (opened/closed/reopened…) |
| other | Mark ignored |

Map installation → team via `github_connections.installation_id`. If unknown installation → log + mark ignored (no team yet).

---

## 8. Sync job

Queue `github-sync-repos`:

- Input: `{ installationId }` or `{ teamId }`.
- `jobId`: `github-sync-repos:{installationId}` to coalesce.
- List repos via installation token (paginate).
- Bulk upsert `github_repos`; set `last_synced_at`.
- Redis lock `lock:github-sync:{installationId}` NX EX 300.

Manual trigger: `POST /teams/:teamId/github/sync` → enqueue 202.

Optional repeatable scheduler after first connect (same pattern as Workspace Phase 2).

---

## 9. HTTP API summary

| Method | Path | Auth |
|--------|------|------|
| GET | `/teams/:teamId/github/install-url` | JWT + team manage |
| GET | `/teams/:teamId/github/connection` | JWT + team view |
| DELETE | `/teams/:teamId/github/connection` | JWT + team manage |
| GET | `/teams/:teamId/github/repos` | JWT + team view |
| POST | `/teams/:teamId/github/sync` | JWT + team manage |
| GET | `/teams/:teamId/github/activity?cursor&take` | JWT + team view |
| GET | `/teams/github/install/callback` | public (state cookie) |
| POST | `/webhooks/github` | public (signature) |

OpenAPI updated accordingly.

Permissions: reuse `requireTeamPermission("team:view")` / `"team:manage"` (lead has manage).

---

## 10. Performance & reliability

- Webhook handler: verify + dedup insert + enqueue only — **no GitHub REST in request path**.
- Installation token cached in Redis.
- Activity list from DB indexes; optional Redis cache key `github:activity:{teamId}` TTL 60–300s, delete on new activity write.
- Do not store full webhook JSON after processing (optional short retention in job data only).
- Respect GitHub secondary rate limits; BullMQ exponential backoff on 403/429.
- Delivery unique constraint is the hard idempotency layer.

---

## 11. Code layout (MVC)

```
src/lib/github-app.ts              # JWT + installation token
src/lib/github-webhook-verify.ts   # signature helper
src/repositories/github-*.ts
src/services/github-app.service.ts
src/services/github-sync.service.ts
src/services/github-webhook.service.ts
src/controllers/github-team.controller.ts
src/controllers/github-webhook.controller.ts
src/routes/github.routes.ts          # team-scoped under /teams
src/routes/webhooks.routes.ts        # /webhooks/github
src/workers/github.worker.ts
src/validators/github.validators.ts
```

Wire in `container.ts`; start worker from `index.ts` alongside workspace worker.

---

## 12. Testing

- Unit: signature verify (valid/invalid), delivery dedupe logic.
- Integration: webhook with fixture payload → delivery row + job processed → activity/repo rows (mock GitHub API).
- Manual: real GitHub App in a test org when credentials available.

---

## 13. Decisions log

| Decision | Choice |
|----------|--------|
| Scope | A — no Task linking |
| Auth model | GitHub App (not PAT) |
| One connection per team | Yes |
| Webhook response | 202 after accept |
| Activity storage | Normalized table (not live GitHub query) |
| Raw payload retention | Not persisted long-term |

---

*End of Phase 3 GitHub App design.*
