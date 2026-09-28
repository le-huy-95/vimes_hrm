# Multi-Google Link Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Force email/password users to link Google before the app; allow multiple Google accounts; switch Primary with confirm dialog and rebind (clear Google bridges, keep Vimes data).

**Architecture:** Identity-service owns link + set-primary + rebind transaction. Flutter router gates on `googleAccounts.isEmpty`. Sync tab lists accounts and drives link/set-primary UX. Sync hot path still reads `isPrimary: true` only.

**Tech Stack:** Prisma/Postgres, Express identity-service, Flutter (go_router, bloc), existing `link-id-token` + Google Sign-In helper.

**Spec:** `docs/superpowers/specs/2026-09-28-multi-google-link-gate-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/packages/db/prisma/schema.prisma` | Add optional `email` on `UserGoogleAccount` |
| `backend/apps/identity-service/src/infra/google-accounts.ts` | Multi-link rules; setPrimary + rebind |
| `backend/apps/identity-service/src/modules/auth/*` | Routes/controller/service for set-primary |
| `frontend/lib/features/auth/data/*` | me + link + setPrimary APIs; models with email |
| `frontend/lib/features/auth/bloc/*` | Keep `googleAccounts` on authenticated state |
| `frontend/lib/app/router/app_router.dart` | `/link-google` gate |
| `frontend/lib/features/auth/pages/link_google_page.dart` | Mandatory link UI |
| `frontend/lib/features/sync/pages/sync_tab_page.dart` | Account list, add, set primary + dialog |

---

### Task 1: Schema — Google account email

**Files:**
- Modify: `backend/packages/db/prisma/schema.prisma`
- Run: prisma migrate / db push as project convention

- [ ] Add `email String?` mapped `email` on `UserGoogleAccount`
- [ ] Apply migration
- [ ] Commit

### Task 2: Backend multi-link + set-primary rebind

**Files:**
- Modify: `backend/apps/identity-service/src/infra/google-accounts.ts`
- Modify: `backend/apps/identity-service/src/modules/auth/auth.service.ts`
- Modify: `backend/apps/identity-service/src/modules/auth/auth.controller.ts`
- Modify: `backend/apps/identity-service/src/modules/auth/auth.routes.ts`
- Modify: `backend/apps/identity-service/src/modules/auth/auth.schemas.ts` (if needed)
- Test: `backend/apps/api-gateway/tests/auth-guard.test.ts` (path not public)

- [ ] `attachGoogleToUser`: allow additional subs; email match only when user has 0 accounts; save `email`; first → primary, else non-primary
- [ ] `setGoogleAccountPrimary(userId, googleSub)`: transaction rebind per spec §4.3
- [ ] Wire `POST /auth/google/accounts/:googleSub/primary`
- [ ] `/auth/me` include `email` on googleAccounts
- [ ] Commit

### Task 3: Frontend auth models + repository + bloc

**Files:**
- Modify: `frontend/lib/features/auth/data/auth_models.dart`
- Modify: `frontend/lib/features/auth/data/auth_repository.dart`
- Modify: `frontend/lib/features/auth/bloc/auth_state.dart`
- Modify: `frontend/lib/features/auth/bloc/auth_bloc.dart`
- Modify: `frontend/lib/features/auth/bloc/auth_event.dart` (if needed)

- [ ] `GoogleAccountBrief.email`; `AuthAuthenticated` holds `List<GoogleAccountBrief> googleAccounts`
- [ ] After login/bootstrap/link: load me and set accounts
- [ ] `setGoogleAccountPrimary(googleSub)`
- [ ] Commit

### Task 4: Router gate + LinkGooglePage

**Files:**
- Create: `frontend/lib/features/auth/pages/link_google_page.dart`
- Modify: `frontend/lib/app/router/app_router.dart`

- [ ] Route `/link-google`
- [ ] Redirect: authenticated + empty accounts → gate; has accounts on gate → home
- [ ] Page: link CTA + logout
- [ ] Commit

### Task 5: Sync UI multi-account

**Files:**
- Modify: `frontend/lib/features/sync/pages/sync_tab_page.dart`

- [ ] Account list from AuthBloc / me refresh
- [ ] Liên kết thêm; Đặt Primary + confirm dialog; re-auth primary
- [ ] Commit

### Task 6: Verify

- [ ] `bunx tsc -p apps/identity-service --noEmit`
- [ ] Gateway auth-guard test for new path not public
- [ ] Dart analyze on touched frontend files

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Email gate `/link-google` | 4 |
| Multi-Google + email mismatch first only | 2 |
| Set primary + rebind B | 2, 5 |
| Confirm dialog A | 5 |
| Sync manage accounts | 5 |
| `/auth/me` list | 2, 3 |
| Hot path primary unchanged | 2 (no poller change) |
