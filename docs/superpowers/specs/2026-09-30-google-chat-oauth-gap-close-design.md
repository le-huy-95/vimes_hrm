# Design: Google Chat OAuth proxy — gap-close (bidirectional live client)

**Date:** 2026-09-30  
**Updated:** 2026-09-30 (classifier, smoke ownership, DoD, plan archive)  
**Status:** Approved (chat) — ready for implementation plan  
**Parent:** [2026-09-29-google-chat-oauth-proxy-design.md](./2026-09-29-google-chat-oauth-proxy-design.md)  
**Approach:** Gap-close on existing User OAuth proxy (live client). Mirror/bridge into `chat-service` is **out of scope** (deferred).

## Goal

Make the Flutter Chat tab work end-to-end as a **Google Chat live client** for the current group:

1. App → Google Chat: send text  
2. Google Chat → App: read history + poll while thread is open  

Same code path for **Google Workspace and personal Gmail**, with honest readiness when Chat is unavailable (especially personal Gmail).

This is **not** a DB mirror sync and **not** Phase 3.5 bridge (webhook → `chat-service` → Socket).

## Decisions

| Topic | Decision |
|-------|----------|
| Product UX | Google Chat only (unchanged from 2026-09-29) |
| Implementation style | Diagnose-first gap-close; no rewrite; no dual native+Google UX |
| Reverse path | Poll / pull-to-refresh via Chat API (no webhook this round) |
| Account types | Same pipeline; Gmail may hit `chat_disabled` |
| Hard DoD | **Workspace** user end-to-end via gateway |
| Soft DoD | Personal Gmail: pass **or** clean documented `chat_disabled` gate |
| Success bar | Smoke must pass through **API gateway**, not only direct sync-service |
| Deferred | Mirror into chat-service, Socket bus, file/reactions/cards, bot JWT |
| Prior plan | [2026-09-29-google-chat-oauth-proxy.md](../plans/2026-09-29-google-chat-oauth-proxy.md) is **historical** — do not execute its unchecked boxes |

## Architecture (unchanged shape)

```
Flutter Chat tab
  → API Gateway (JWT) ── /sync/chat/*
    → google-sync-service
        → Google Chat API (user refresh token)
        → Postgres: google_chat_spaces (group ↔ space links only)
```

`chat-service` remains unused for Chat tab list/thread/send.

## Diagnose-first (mandatory) — Task 0 ownership

Most proxy code already exists. “Steps 1–5 all broken” may be **config/token**, not missing features.

**Task 0 (blocker before feature code):** produce written smoke evidence (status + response body or log excerpt) for each step below.

| Step | Owner | Artifact |
|------|--------|----------|
| Stack up (gateway + google-sync + DB) | Implementer | health OK |
| Real user JWT + Google-linked account | **User / operator** supplies login or JWT | token usable against gateway |
| GCP: Chat API enabled; OAuth consent has Chat scopes | **User / operator** | checkbox in runbook |
| `GET /sync/chat/readiness` via gateway | Implementer | recorded JSON status |
| Re-consent if not `ready` | User completes Relink; implementer re-probes | readiness after link |
| `GET /sync/chat/spaces` → link → `GET/POST .../messages` via gateway | Implementer | pass/fail + bodies |

If JWT/GCP/user consent is missing, **stop and ask the user** — do not invent speculative code fixes.

Only after Task 0 fails with evidence may code changes target that failure.

## Known gaps to close (explicit)

### 1. Identity OAuth scopes out of sync

Flutter `kGoogleSyncScopes` includes Chat; identity `GOOGLE_OAUTH_SCOPES` still stops at Tasks/Sheets/Drive.file.

**Fix:** Add the same Chat scopes to identity defaults (web PKCE / server-driven consent) so they match Flutter.

**Priority note:** Aligning the constant alone is **not** enough. The primary Flutter path uses `serverAuthCode` + `authorizeServer`. Prefer **verified re-consent** (Relink → readiness `ready`) over assuming a constant change fixes existing refresh tokens.

### 2. Silent authorize failure on client

`authorizeServer(kGoogleSyncScopes)` is caught and ignored — login/link can succeed **without** a Chat-capable refresh.

**Fix:** When Chat tab needs Chat, treat missing/failed server auth as blocking for Chat-ready UX; hard CTA Relink Google. After Relink, Chat tab must re-call readiness (not assume success).

### 3. Encoded `spaceName` path through gateway

FE uses `Uri.encodeComponent(spaceName)` (`spaces%2F...`). Gateway/proxy may decode `%2F` and break routing.

**Fix order:**

1. Task 0 smoke list/send **through gateway** with encoded path  
2. If broken: API uses `spaceName` as **query or body** (e.g. `GET /sync/chat/messages?groupId=&spaceName=`) — no `/` inside path segments  

Do not mark message DoD done until gateway smoke passes.

### 4. Readiness classifier false positives (must fix)

Current `classifyChatProbeError` maps bare `httpStatus === 403 || 404` → `chat_disabled`. Many scope / API-not-enabled / permission errors are also 403 → UI says “chưa bật Chat” when user needs **re-consent** or ops must enable Chat API.

**Required classification order:**

1. `AUTH_REQUIRED` / `invalid_grant` → `needs_reconsent`  
2. Insufficient / missing Chat **scopes** (message or known Google codes) → `needs_reconsent`  
3. Explicit Chat-not-enabled / not a Chat user phrasing → `chat_disabled`  
4. API not enabled / access not configured (GCP) → `error` with ops-oriented reason (not `chat_disabled`)  
5. Other 403/404 → `error` (or `needs_reconsent` if ambiguous authz), **never** default `chat_disabled`  

Extend unit tests beyond the single “insufficient authentication scopes” string.

### 5. Personal Gmail expectations

Same UX/APIs as Workspace. True Chat-unavailable → `chat_disabled` + help + Retry / Open Google Chat. **Do not** invent in-app “create Chat account”. Copy must not promise every `@gmail.com` can chat.

### 6. Poll semantics (honest “sync back”)

- While thread open: poll ~10s + pull-to-refresh  
- No durable app-side message store; no delivery while app closed  
- Latency target ~10–15s when thread open  
- **Non-goals:** deep history backfill, incremental `filter` by time, pages beyond first ~50 messages in MVP  

Document in runbook so “đồng bộ ngược” ≠ bridge mirror.

## In-scope work layers

| Layer | Work |
|-------|------|
| Task 0 | Smoke ownership table; block on missing JWT/GCP |
| OAuth / token | Align identity Chat scopes; verified re-consent; stop silent Chat auth failure |
| Readiness | Fix classifier order + tests; FE gates match statuses |
| Link | OWNER/ADMIN picker + unlink; members wait; empty CTAs (fix if smoke fails) |
| Messages | List/send text; path or query fix if gateway `%2F` fails |
| Poll | Keep behavior; no wipe on transient poll error |
| Ops | Runbook: diagnose-first, gateway smoke, Gmail limits, classifier notes |
| Leave / create-task | Fix only if Task 0 proves broken |

## Out of scope

- Ingest Google → `chat-service` / Socket realtime  
- Egress bridge stub as product path  
- File upload, reactions, rich cards, threaded replies parity  
- Guaranteed realtime  
- Changing Sheets/Tasks beyond shared consent  
- Re-executing historical plan 2026-09-29 checkboxes  
- Optional rename of OAuth cache key `sheets:${userId}` (cosmetic; not required)

## Error handling

| Case | Behavior |
|------|----------|
| Missing Chat scopes / no refresh | `needs_reconsent` → Relink Google |
| Chat not enabled (explicit) | `chat_disabled` → help + Retry / Open Google Chat |
| GCP Chat API not enabled / ambiguous 403 | `error` (+ ops reason); not fake `chat_disabled` |
| Space not linked to group | 403 `NOT_LINKED`; no blind Google call |
| User not in Google space | Clear error on open/send; admin may unlink |
| Google rate limit | Backoff + toast; don’t tighten poll into a storm |
| Poll failure after successful send | Keep existing messages; soft error |

## Definition of Done

### Hard (required)

With a **Google Workspace** user, through **gateway** URLs Flutter uses:

1. After re-consent, readiness is `ready`  
2. Admin links ≥1 space to the group  
3. Send from app appears in Google Chat  
4. Message from Google Chat appears in app within ~10–15s while thread open  
5. Classifier unit tests cover scope vs chat_disabled vs error ordering  
6. Identity Chat scopes aligned with Flutter; Chat authorize failure visible when blocking Chat  

### Soft (record, do not block hard DoD)

Personal Gmail: either same hard path **or** clean `chat_disabled` / documented limitation in runbook notes for that account.

## Testing

- Unit: readiness classifier (scope / chat_disabled / API-disabled / AUTH_REQUIRED / bare 403→error)  
- Task 0 smoke: curl through gateway with operator-provided JWT  
- Manual Chrome (Workspace): empty CTA → link → send → poll receive; Relink on `needs_reconsent`  
- Soft: Gmail gate screen if Chat unavailable  
- Regression: Tasks/Sheets consent still works after scope list change  

## File touchpoints (expected)

- `backend/apps/identity-service/src/infra/google-oauth.ts` — Chat scopes  
- `frontend/lib/features/auth/data/google_sign_in_helper.dart` — stop silent Chat auth failure (as needed)  
- `backend/apps/google-sync-service/src/modules/chat/chat-readiness.ts` (+ tests) — classifier order  
- `backend/apps/google-sync-service/src/modules/chat/**` — path/query fix if gateway breaks `%2F`  
- `frontend/lib/features/home/data/google_chat_repository.dart` — match API if path changes  
- `frontend/lib/features/chat/**` — readiness / reconsent UX only as needed  
- `backend/docs/runbooks/google-chat-oauth-proxy.md` — Task 0, gateway smoke, Gmail, classifier  
- `docs/superpowers/plans/2026-09-29-google-chat-oauth-proxy.md` — mark **historical / superseded**  

Prefer minimal diffs; do not resurrect native Chat tab as primary UX.

## Relation to prior plan

**Canonical execution:** a **new** implementation plan derived only from **this** spec (Task 0 → proven fixes → hard DoD).

[`docs/superpowers/plans/2026-09-29-google-chat-oauth-proxy.md`](../plans/2026-09-29-google-chat-oauth-proxy.md) is **historical**: much of it was already implemented; remaining unchecked boxes must **not** be run blindly. Leave/create-task stay as already shipped unless Task 0 proves broken.
