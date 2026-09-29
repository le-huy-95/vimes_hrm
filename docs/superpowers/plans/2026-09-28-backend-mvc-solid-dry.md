# Backend MVC + SOLID/DRY Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deduplicate HTTP/auth/crypto into `@manage-teams/common`, then split identity/core/chat into light MVC without changing HTTP contracts.

**Architecture:** Extend `common` with `http.ts`, `auth.ts`, `crypto.ts`. Each service: `index.ts` bootstrap → `app.ts` mount → `routes` → `controllers` → `services` + `dto`. Prisma stays in services. Gateway reuses `verifyAccessToken`.

**Tech Stack:** Express, jose, Zod, Prisma, vitest, pnpm/turbo

**Spec:** [docs/superpowers/specs/2026-09-28-backend-mvc-solid-dry-design.md](../specs/2026-09-28-backend-mvc-solid-dry-design.md)

---

## File map

| Path | Role |
|------|------|
| `packages/common/src/http.ts` | `sendError`, `asyncHandler` |
| `packages/common/src/auth.ts` | `getJwtSecret`, `verifyAccessToken`, `requireUser` |
| `packages/common/src/crypto.ts` | `sha256`, `randomToken` |
| `packages/common/src/index.ts` | re-exports |
| `apps/*/src/app.ts` | Express app assembly |
| `apps/*/src/routes/*.ts` | Router wiring |
| `apps/*/src/controllers/*.ts` | HTTP glue |
| `apps/*/src/services/*.ts` | Domain + prisma |
| `apps/*/src/dto/*.ts` | Zod schemas |
| `apps/*/src/index.ts` | listen only |

---

### Task 1: Common `crypto` + tests

**Files:**
- Create: `backend/packages/common/src/crypto.ts`
- Create: `backend/packages/common/src/crypto.test.ts`
- Modify: `backend/packages/common/src/index.ts`
- Modify: `backend/packages/common/package.json` (if needed)

- [ ] **Step 1:** Add `sha256(value: string): string` and `randomToken(bytes?: number): string` using `node:crypto`.
- [ ] **Step 2:** Vitest: round-trip hash deterministic; token length/uniqueness.
- [ ] **Step 3:** Export from `index.ts`.
- [ ] **Step 4:** Run `pnpm --filter @manage-teams/common test` — pass.
- [ ] **Step 5:** Commit `refactor(common): add shared sha256 and randomToken`.

---

### Task 2: Common `http` + `auth` + tests

**Files:**
- Create: `backend/packages/common/src/http.ts`
- Create: `backend/packages/common/src/auth.ts`
- Create: `backend/packages/common/src/http.test.ts`
- Create: `backend/packages/common/src/auth.test.ts`
- Modify: `backend/packages/common/package.json` — add `jose`; peer/dev `@types/express` optional; type `HeaderCarrier` instead of full Express if possible
- Modify: `backend/packages/common/src/index.ts`

- [ ] **Step 1:** `sendError(res, err, logger?)` — AppError → status+json; Zod-like `issues` → 400; else 500 + log.
- [ ] **Step 2:** `asyncHandler(fn)` wraps async route and forwards errors to `next`.
- [ ] **Step 3:** `getJwtSecret()`, `verifyAccessToken(token)`, `requireUser(req)` throwing `AppError` UNAUTHORIZED.
- [ ] **Step 4:** Unit tests with mock `res` / fake JWT (sign with jose in test).
- [ ] **Step 5:** Run common tests — pass; commit `refactor(common): add sendError and JWT requireUser helpers`.

---

### Task 3: Wire services to common helpers (no MVC yet)

**Files:**
- Modify: `backend/apps/identity-service/src/index.ts`, `crypto.ts` (re-export or delete and import common)
- Modify: `backend/apps/core-service/src/index.ts`
- Modify: `backend/apps/chat-service/src/index.ts`
- Modify: `backend/apps/api-gateway/src/auth-guard.ts` — use `verifyAccessToken`

- [ ] **Step 1:** Replace local `sendError` / `requireUser` / JWT encode bootstrap with common imports.
- [ ] **Step 2:** Identity: keep Argon2/OTP in local `crypto.ts`; use common `sha256`/`randomToken` where duplicated.
- [ ] **Step 3:** Typecheck identity, core, chat, gateway + existing tests.
- [ ] **Step 4:** Commit `refactor(backend): use shared common HTTP/auth/crypto helpers`.

---

### Task 4: core-service MVC (org / group / task)

**Files:**
- Create: `backend/apps/core-service/src/app.ts`
- Create: `backend/apps/core-service/src/dto/*.schemas.ts`
- Create: `backend/apps/core-service/src/services/access.service.ts`
- Create: `backend/apps/core-service/src/services/org.service.ts`
- Create: `backend/apps/core-service/src/services/group.service.ts`
- Create: `backend/apps/core-service/src/services/task.service.ts`
- Create: `backend/apps/core-service/src/services/outbox.service.ts` (envelope helper)
- Create: `backend/apps/core-service/src/controllers/*.ts`
- Create: `backend/apps/core-service/src/routes/*.ts`
- Modify: `backend/apps/core-service/src/index.ts` → bootstrap only
- Delete/retire unused inline schemas in old index

- [ ] **Step 1:** Extract Zod DTOs to `dto/`.
- [ ] **Step 2:** Move access checks + org/group/task logic into services (behavior identical).
- [ ] **Step 3:** Controllers + routes; `app.ts` mounts; `index.ts` listens.
- [ ] **Step 4:** Typecheck core; smoke mentally against prior routes list.
- [ ] **Step 5:** Commit `refactor(core): split org/group/task into MVC layers`.

---

### Task 5: identity-service MVC

**Files:**
- Create: `app.ts`, `routes/auth.routes.ts`, `controllers/auth.controller.ts`, `services/token.service.ts`
- Move: treat `otp.ts`, `google-accounts.ts`, `google-oauth.ts`, `mailer.ts` as services
- Modify: `index.ts` bootstrap

- [ ] **Step 1:** Extract token issuing to `token.service.ts`.
- [ ] **Step 2:** Auth controller methods for each `/auth/*` route.
- [ ] **Step 3:** Mount via `app.ts`; index listens.
- [ ] **Step 4:** Run identity tests + typecheck.
- [ ] **Step 5:** Commit `refactor(identity): MVC auth routes and controllers`.

---

### Task 6: chat-service MVC + socket split

**Files:**
- Create: `app.ts`, `socket.ts`, `routes/conversation.routes.ts`, `controllers/conversation.controller.ts`, `controllers/internal.controller.ts`, `services/conversation.service.ts`, `dto/`
- Modify: `index.ts` bootstrap HTTP+Socket

- [ ] **Step 1:** Move ensure/list/post message logic to service.
- [ ] **Step 2:** Controllers for public + internal routes.
- [ ] **Step 3:** Socket.IO setup in `socket.ts`; attach to httpServer in index.
- [ ] **Step 4:** Typecheck chat.
- [ ] **Step 5:** Commit `refactor(chat): MVC HTTP and separate socket bootstrap`.

---

### Task 7: Verify Alpha gate

- [ ] **Step 1:** `pnpm --filter @manage-teams/common test` + typecheck all touched packages.
- [ ] **Step 2:** Confirm no local `function sendError` / duplicate `requireUser` left in identity/core/chat.
- [ ] **Step 3:** Optional smoke: health endpoints up.
- [ ] **Step 4:** Commit any leftover doc tweaks if needed.

---

## Self-review checklist

- Spec coverage: common first then MVC order matches design §5.
- No Nest/DI scope creep.
- HTTP contracts unchanged.
