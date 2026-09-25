# Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two runnable repos (API + Web) with local+Google auth, org/team tree, RBAC, and usable UI for teams/members.

**Architecture:** Express+Prisma API owns Postgres; Vite+React web calls REST with JWT; OpenAPI file in API drives a typed fetch client on web. Vertical slices: scaffold → schema → auth → teams/RBAC → web UI.

**Tech Stack:** Node 20+, Express, Prisma, PostgreSQL 16, Redis 7 (Compose only), JWT+bcrypt, Google OAuth2, AES-256-GCM token encryption, Vite, React Router, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-25-phase1-foundation-design.md`

---

## File map

### API (`/Users/huy/Documents/code/manage-teams`)

| Path | Responsibility |
|------|----------------|
| `package.json` | Scripts: `dev`, `build`, `prisma:*`, `test` |
| `docker-compose.yml` | Postgres 16 + Redis 7 |
| `.env.example` | Env template |
| `prisma/schema.prisma` | Phase 1 tables |
| `prisma/seed.ts` | roles_permissions seed |
| `src/index.ts` | HTTP server bootstrap |
| `src/app.ts` | Express app, CORS, routes |
| `src/lib/prisma.ts` | Prisma client singleton |
| `src/lib/env.ts` | Zod-validated env |
| `src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt |
| `src/lib/password.ts` | bcrypt hash/verify |
| `src/lib/tokens.ts` | JWT access + refresh hash helpers |
| `src/middleware/auth.ts` | `authenticateJWT` |
| `src/middleware/rbac.ts` | `requireTeamPermission(key)` |
| `src/middleware/error.ts` | Central error handler |
| `src/routes/auth.ts` | Auth routes |
| `src/routes/orgs.ts` | Org me routes |
| `src/routes/teams.ts` | Teams + members routes |
| `src/services/auth.service.ts` | Register/login/refresh/oauth |
| `src/services/team.service.ts` | Team tree + members + audit |
| `openapi/openapi.yaml` | Hand-maintained Phase 1 OpenAPI |
| `src/__tests__/auth.test.ts` | Auth integration tests |
| `src/__tests__/teams.test.ts` | RBAC/team tests |

### Web (`/Users/huy/Documents/code/manage-teams-web`)

| Path | Responsibility |
|------|----------------|
| `package.json` | Vite React app |
| `src/main.tsx` | Entry |
| `src/App.tsx` | Router |
| `src/api/client.ts` | Fetch wrapper + token |
| `src/api/types.ts` | Types aligned with OpenAPI |
| `src/auth/AuthContext.tsx` | Session state |
| `src/pages/LoginPage.tsx` | Login + Google |
| `src/pages/RegisterPage.tsx` | Register |
| `src/pages/AppLayout.tsx` | Shell + team tree sidebar |
| `src/pages/TeamPage.tsx` | Team detail + members |
| `src/pages/CreateTeamPage.tsx` | Create team |

---

### Task 1: API scaffold + Docker

**Files:**
- Create: `package.json`, `tsconfig.json`, `docker-compose.yml`, `.env.example`, `.gitignore`, `src/index.ts`, `src/app.ts`, `src/lib/env.ts`, `src/lib/prisma.ts`

- [ ] **Step 1:** Init npm TypeScript Express project with deps: `express`, `cors`, `cookie-parser`, `zod`, `@prisma/client`, `jsonwebtoken`, `bcryptjs`, `helmet`, `dotenv`; dev: `typescript`, `tsx`, `prisma`, `@types/*`, `vitest`, `supertest`

- [ ] **Step 2:** Add `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: manage
      POSTGRES_PASSWORD: manage
      POSTGRES_DB: manage_teams
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
  redis:
    image: redis:7
    ports: ["6379:6379"]
volumes:
  pgdata:
```

- [ ] **Step 3:** `.env.example` with `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `TOKEN_ENCRYPTION_KEY` (32-byte hex), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `WEB_ORIGIN`, `PORT=3001`, `NODE_ENV`

- [ ] **Step 4:** Minimal `src/app.ts` health `GET /health` → `{ ok: true }`; `src/index.ts` listens on `PORT`

- [ ] **Step 5:** `docker compose up -d` and verify `curl localhost:3001/health` after `pnpm/npm run dev`

- [ ] **Step 6:** Commit `chore: scaffold API and docker compose`

---

### Task 2: Prisma schema + seed

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`

- [ ] **Step 1:** Define models matching spec §5: Organization, User, RefreshToken, Team, TeamMember (enum TeamRole), RolePermission, OauthConnection (enum OAuthProvider), AuditLog — with indexes/uniques from spec

- [ ] **Step 2:** `npx prisma migrate dev --name phase1_foundation`

- [ ] **Step 3:** Seed `roles_permissions`:

| role_name | permission_key |
|-----------|----------------|
| lead | team:view, team:manage, member:invite, member:remove, member:role:update |
| member | team:view |
| viewer | team:view |

- [ ] **Step 4:** Commit `feat(db): phase1 prisma schema and rbac seed`

---

### Task 3: Crypto, password, JWT helpers

**Files:**
- Create: `src/lib/crypto.ts`, `src/lib/password.ts`, `src/lib/tokens.ts`

- [ ] **Step 1:** AES-256-GCM encrypt/decrypt using `TOKEN_ENCRYPTION_KEY` (32 bytes)

- [ ] **Step 2:** bcrypt hash/compare (cost 12)

- [ ] **Step 3:** `signAccessToken({ sub, orgId, email })` exp 15m; `createRefreshToken()` random 32 bytes, store sha256 hash, cookie value = raw token

- [ ] **Step 4:** Unit test crypto roundtrip + password verify

- [ ] **Step 5:** Commit `feat(api): auth crypto and token helpers`

---

### Task 4: Auth service + routes (local)

**Files:**
- Create: `src/services/auth.service.ts`, `src/routes/auth.ts`, `src/middleware/auth.ts`, `src/middleware/error.ts`
- Modify: `src/app.ts`

- [ ] **Step 1:** `register({ email, password, fullName, orgName })` — create Organization + User (password hash) in transaction; issue tokens; set refresh cookie

- [ ] **Step 2:** `login` — verify password; issue tokens

- [ ] **Step 3:** `refresh` — read cookie, validate hash + expiry + not revoked; rotate refresh; new access

- [ ] **Step 4:** `logout` — revoke refresh

- [ ] **Step 5:** `GET /auth/me` with `authenticateJWT`

- [ ] **Step 6:** Integration test: register → me → logout

- [ ] **Step 7:** Commit `feat(api): local auth register login refresh logout`

---

### Task 5: Google OAuth

**Files:**
- Modify: `src/services/auth.service.ts`, `src/routes/auth.ts`
- Create: `src/lib/google.ts`

- [ ] **Step 1:** Build Google auth URL (scopes: `openid email profile`)

- [ ] **Step 2:** Callback: exchange code, fetch userinfo, link-by-email or create org+user, upsert `oauth_connections` with encrypted tokens, set session cookies, redirect `${WEB_ORIGIN}/oauth/callback`

- [ ] **Step 3:** If `GOOGLE_CLIENT_ID` empty, routes return 503 with clear message (dev without Google still works for local auth)

- [ ] **Step 4:** Commit `feat(api): google oauth login and account link`

---

### Task 6: Teams + members + RBAC

**Files:**
- Create: `src/middleware/rbac.ts`, `src/services/team.service.ts`, `src/routes/teams.ts`, `src/routes/orgs.ts`
- Modify: `src/app.ts`

- [ ] **Step 1:** `requireTeamPermission(permissionKey)` loads membership, joins RolePermission, 403 if missing; also enforces `team.org_id === user.org_id`

- [ ] **Step 2:** Implement org + team endpoints from spec §7

- [ ] **Step 3:** `POST /teams` — creator becomes `lead` in `team_members`

- [ ] **Step 4:** `POST /teams/:id/members` — find user by email in same org; audit_log

- [ ] **Step 5:** `DELETE /teams/:id` — 409 if children exist

- [ ] **Step 6:** `GET /teams?as=tree` — nest by `parent_team_id`

- [ ] **Step 7:** Integration tests: lead can manage; member viewer cannot PATCH; delete with child fails

- [ ] **Step 8:** Commit `feat(api): teams tree members and rbac`

---

### Task 7: OpenAPI document

**Files:**
- Create: `openapi/openapi.yaml`

- [ ] **Step 1:** Document all Phase 1 paths, schemas (User, Team, TeamMember, Auth tokens), Bearer security

- [ ] **Step 2:** Commit `docs(api): phase1 openapi.yaml`

---

### Task 8: Web scaffold + auth pages

**Files (in `manage-teams-web`):**
- Create Vite React-TS app, React Router, pages Login/Register, AuthContext, api client

- [ ] **Step 1:** `npm create vite@latest manage-teams-web -- --template react-ts` in `/Users/huy/Documents/code/`

- [ ] **Step 2:** `src/api/client.ts` — base URL `VITE_API_URL`, credentials include, store access token in memory; on 401 try `/auth/refresh` once

- [ ] **Step 3:** Login/Register pages call API; Google button → `window.location = ${API}/auth/google`

- [ ] **Step 4:** OAuth callback route reads session via `/auth/me`

- [ ] **Step 5:** Commit web `chore: scaffold web auth pages`

---

### Task 9: Web teams UI

**Files:**
- Create: `AppLayout`, `TeamPage`, `CreateTeamPage`, team tree component

- [ ] **Step 1:** Sidebar loads `GET /teams?as=tree`

- [ ] **Step 2:** Team page: detail, edit (if lead), members table, invite form, role change, remove

- [ ] **Step 3:** Create team with optional parent select

- [ ] **Step 4:** Protect routes — redirect to `/login` if `/auth/me` fails

- [ ] **Step 5:** Manual checklist: register → create team → invite second user as lead of another team → verify RBAC

- [ ] **Step 6:** Commit `feat(web): team tree and members UI`

---

### Task 10: README + verify both repos run

- [ ] **Step 1:** API `README.md` — compose up, migrate, seed, env, `npm run dev`

- [ ] **Step 2:** Web `README.md` — `VITE_API_URL`, `npm run dev`

- [ ] **Step 3:** Smoke: health, register, create team from UI

- [ ] **Step 4:** Commit docs

---

## Execution order

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

## Spec coverage checklist

| Spec section | Task |
|--------------|------|
| 2-repo layout | 1, 8 |
| Auth local + Google | 4, 5 |
| Schema Phase 1 | 2 |
| RBAC lead-only manage | 6 |
| HTTP API | 4–6 |
| Web UI | 8–9 |
| Docker | 1 |
| OpenAPI | 7 |
| Security baseline | 3–5 (crypto, cookies, CORS) |

---

*End of plan.*
