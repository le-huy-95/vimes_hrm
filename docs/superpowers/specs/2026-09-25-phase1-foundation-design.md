# Phase 1 Foundation Design — Quản lý nhân sự theo nhóm

**Date:** 2026-09-25  
**Status:** Approved; implementation in progress  
**Source plan:** `/Users/huy/Downloads/ke-hoach-tich-hop-he-thong.md`  
**Scope of this spec:** Phase 1 only (scaffold + auth + RBAC + team tree + usable UI). Later phases get their own specs/plans.

---

## 1. Goals & non-goals

### Goals (Phase 1 done when)
- Two repos exist and run locally: API + Web.
- User can register/login with email+password **or** Google OAuth.
- User belongs to an organization; can create/edit a **team tree** (`parent_team_id`).
- Team membership with roles `lead | member | viewer` enforced by Express RBAC middleware.
- Web UI supports auth + team CRUD + member management end-to-end.
- API exposes OpenAPI; web consumes a generated typed client.
- Docker Compose brings up Postgres (+ Redis for later phases, unused in Phase 1 logic).

### Non-goals (explicitly deferred)
- Google Workspace Directory sync, GitHub App, Task/Project, Storage (S3/MinIO), Socket.IO chat, Google Chat bot, BullMQ workers, dashboard aggregation, dedup hardening beyond Phase 1 uniqueness constraints.

---

## 2. Repository layout (2 repos)

```
/Users/huy/Documents/code/
├── manage-teams/              # API (this workspace)
│   ├── src/
│   ├── prisma/
│   ├── openapi/
│   ├── docker-compose.yml     # Postgres 16 + Redis 7
│   └── docs/superpowers/
└── manage-teams-web/          # Vite + React (sibling repo)
    └── src/api/               # client generated from OpenAPI
```

| Repo | Stack | Phase 1 responsibility |
|------|--------|-------------------------|
| `manage-teams` | Node.js, Express, Prisma, TypeScript | Schema, auth, RBAC, team/member APIs, OpenAPI, Docker |
| `manage-teams-web` | Vite, React, TypeScript | Login/register, Google OAuth UX, team tree, members UI |

**Shared contract:** OpenAPI published by API → generate TS client for web (orval or openapi-typescript). Prisma stays in API only. No shared npm package in Phase 1.

**Future workers / Socket.IO:** remain inside the API repo (or child processes) until a later decision to split a third repo.

---

## 3. Architecture (Phase 1)

```
Browser (manage-teams-web)
    │  REST + JWT (Authorization: Bearer)
    │  Google OAuth redirect via API callback
    ▼
Express API (manage-teams)
    │  Prisma
    ▼
PostgreSQL

Redis: started in Compose, not required by Phase 1 request path.
```

**Approach:** Vertical slices — scaffold → auth → teams/RBAC → UI — each slice testable end-to-end before the next.

---

## 4. Authentication

### Local
- `POST /auth/register` — email, password, full_name; creates org (or joins by invite later — Phase 1: first user creates org).
- `POST /auth/login` — returns access JWT (short-lived).
- Refresh token: long-lived, stored as **hash** in `refresh_tokens`; delivered to browser as **httpOnly Secure cookie** (preferred) or documented alternative if cookie cross-origin is blocked in local dev (then SameSite + CORS credentials).
- `POST /auth/refresh`, `POST /auth/logout` (revoke refresh).

### Google OAuth
- `GET /auth/google` → Google consent.
- `GET /auth/google/callback` → upsert user by email / `google_user_id`, store encrypted tokens in `oauth_connections` (AES-256), issue same JWT/refresh session as local login, redirect to web.
- **Account linking:** same email as existing local user → link `google_user_id` + oauth row; new email → create user in org (rules: if no org yet, create org; if logged-in link flow, attach to current org — Phase 1 minimum: link-by-email on callback).

### Password
- `users.password_hash` nullable (Google-only accounts allowed).
- bcrypt (or argon2id) for local passwords.

### Out of scope for Socket
- Socket.IO handshake JWT deferred to Phase 6; design JWT payload so it can be reused (`sub`, `org_id`, `email`).

---

## 5. Database schema (Phase 1 only)

Tables:

| Table | Purpose |
|-------|---------|
| `organizations` | `id`, `name`, `domain`, `created_at` |
| `users` | `id`, `org_id`, `email` (unique), `full_name`, `password_hash` nullable, `google_user_id` nullable unique, `avatar_file_id` nullable (unused until Storage), `status`, `created_at` |
| `refresh_tokens` | `id`, `user_id`, `token_hash`, `expires_at`, `created_at`, `revoked_at` nullable |
| `teams` | `id`, `org_id`, `parent_team_id` nullable (self-FK), `name`, `description`, `created_at` |
| `team_members` | `id`, `team_id`, `user_id`, `role` (`lead`\|`member`\|`viewer`), `joined_at`; **UNIQUE(team_id, user_id)** |
| `roles_permissions` | `id`, `role_name`, `permission_key` |
| `oauth_connections` | `id`, `user_id`, `provider` (`google`\|`github`), `access_token_enc`, `refresh_token_enc`, `scope`, `expires_at` |
| `audit_logs` | `id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `meta` JSONB, `created_at` |

**Indexes (Phase 1):**
- `team_members(team_id)`, `team_members(user_id)`, unique `(team_id, user_id)`
- `teams(org_id)`, `teams(parent_team_id)`
- `users(org_id)`, unique `users(email)`, unique `users(google_user_id)` where not null

**Not created in Phase 1:** `github_*`, `projects`/`tasks`, `files`, `channels`/`messages`, `gchat_*`, `google_workspace_sync`, `sync_logs` (except audit_logs covers manual admin actions).

---

## 6. RBAC

### Roles (per team membership)
| Role | Intended permissions |
|------|----------------------|
| `lead` | `team:view`, `team:manage`, `member:invite`, `member:remove`, `member:role:update` |
| `member` | `team:view`, `member:invite` (optional — Phase 1: invite only for lead; member = view only + future comment) |
| `viewer` | `team:view` |

**Phase 1 lock-in:** Only `lead` may invite/remove/change roles and edit team metadata. `member` and `viewer` may only `team:view` (list team + members). Revisit member invite in a later phase if product needs it.

### Middleware
```text
authenticateJWT → load membership for :teamId → checkPermission('team:manage')
```

Permission keys are seeded in `roles_permissions` and checked in middleware (not hard-coded role strings alone in every handler — handlers may still short-circuit on lead for clarity, but permission table is source of truth).

### Org boundary
- All team operations verify `team.org_id === user.org_id`.
- No cross-org access.

---

## 7. HTTP API (Phase 1)

### Auth
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /auth/me`

### Organizations / Teams / Members
- `GET /orgs/me` — current user's org
- `PATCH /orgs/me` — update org name (org admin = first user / any user in Phase 1: any authenticated member of org may rename — **simpler Phase 1:** any user in org can PATCH org name; tighten later)
- `GET /teams` — flat or tree query (`?as=tree`)
- `POST /teams` — body includes optional `parent_team_id`
- `GET /teams/:teamId`
- `PATCH /teams/:teamId` — requires `team:manage`
- `DELETE /teams/:teamId` — requires `team:manage`; reject if children exist (or cascade — **Phase 1: reject if children**)
- `GET /teams/:teamId/members`
- `POST /teams/:teamId/members` — email + role; requires `member:invite`
- `PATCH /teams/:teamId/members/:userId` — change role; requires `member:role:update`
- `DELETE /teams/:teamId/members/:userId` — requires `member:remove`

OpenAPI document generated/kept under `openapi/` and used to generate the web client.

---

## 8. Web UI (Phase 1)

Screens:
1. Register / Login (+ Google button)
2. App shell: sidebar with team tree, main outlet
3. Team detail: name, description, edit (lead)
4. Members: list, add by email, change role, remove (lead)
5. Create team (optional parent picker)

**Not in Phase 1 UI:** dashboard widgets, chat, tasks, GitHub activity (empty placeholder routes allowed).

UI follows existing product needs; no requirement for a marketing landing page.

---

## 9. Local infrastructure

`docker-compose.yml` in API repo:
- `postgres:16`
- `redis:7` (idle in Phase 1)
- MinIO **commented or profile-disabled** until Phase 5

Env templates: `.env.example` for API (DATABASE_URL, JWT secrets, Google OAuth client id/secret, TOKEN_ENCRYPTION_KEY, WEB_ORIGIN, COOKIE settings).

---

## 10. Sequential integration roadmap (post–Phase 1)

Each phase = separate spec + implementation plan.

| Phase | Primary repo | Content |
|-------|--------------|---------|
| 1 | api + web | Foundation (this spec) |
| 2 | api | Google Workspace Directory sync (+ avatar; may stub storage until Phase 5) |
| 3 | api | GitHub App + webhook + BullMQ |
| 4 | api + web | Project/Task + GitHub issue link |
| 5 | api | MinIO/S3 presign + confirm + thumbnail jobs |
| 6 | api + web | Internal chat Socket.IO + Redis adapter |
| 7 | api + web | Team dashboard aggregation |
| 8–10 | api | Google Chat bot bidirectional (Pub/Sub StreamingPull) |
| 11–12 | both | Dedup hardening, E2E/load tests, security hardening |

**Dependency note:** Phase 2 avatars ideally need Phase 5 object storage; acceptable interim: store metadata only / skip binary avatar until Phase 5.

---

## 11. Error handling & security (Phase 1 baseline)

- OAuth tokens encrypted at rest (AES-256-GCM) before DB write.
- Passwords never logged; refresh tokens only stored hashed.
- CORS locked to `WEB_ORIGIN`; credentials if using cookies.
- Rate-limit auth endpoints (basic in-memory or Redis later).
- Audit log on role changes and member add/remove.
- No plaintext secrets in repo; `.env.example` only.

---

## 12. Testing strategy (Phase 1)

- API: integration tests against test DB (auth flows, RBAC deny/allow, team tree create/reject delete with children).
- Web: smoke tests optional; manual E2E checklist for login + team CRUD.
- OpenAPI: CI check that generated client builds.

---

## 13. Decisions log

| Decision | Choice |
|----------|--------|
| Delivery shape | Minimal scaffold + Phase 1 plan only (not full-system scaffold) |
| Auth | Local JWT + Google OAuth both in Phase 1 |
| ORM | Prisma |
| Repo topology | **Two repos** (API + Web), not monorepo |
| API↔Web contract | OpenAPI → generated TS client |
| Frontend Phase 1 | Usable UI (not stub-only) |
| Implementation style | Vertical slices |
| Member invite permission | Lead only in Phase 1 |

---

*End of Phase 1 foundation design.*
