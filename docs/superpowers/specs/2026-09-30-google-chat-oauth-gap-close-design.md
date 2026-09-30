# Design: Google Chat OAuth proxy — gap-close (bidirectional live client)

**Date:** 2026-09-30  
**Status:** Approved (chat) — ready for implementation plan  
**Parent:** [2026-09-29-google-chat-oauth-proxy-design.md](./2026-09-29-google-chat-oauth-proxy-design.md)  
**Approach:** Gap-close on existing User OAuth proxy (live client). Mirror/bridge into `chat-service` is **out of scope** (deferred).

## Goal

Make the Flutter Chat tab work end-to-end as a **Google Chat live client** for the current group:

1. App → Google Chat: send text  
2. Google Chat → App: read history + poll while thread is open  

Support **Google Workspace and personal Gmail** on the **same pipeline**, with honest readiness when Chat is unavailable (especially personal Gmail).

This is **not** a DB mirror sync and **not** Phase 3.5 bridge (webhook → `chat-service` → Socket).

## Decisions

| Topic | Decision |
|-------|----------|
| Product UX | Google Chat only (unchanged from 2026-09-29) |
| Implementation style | Diagnose-first gap-close; no rewrite; no dual native+Google UX |
| Reverse path | Poll / pull-to-refresh via Chat API (no webhook this round) |
| Account types | Workspace + Gmail: same code path; Gmail may hit `chat_disabled` |
| Success bar | DoD smoke below must pass through **API gateway**, not only direct sync-service |
| Deferred | Mirror into chat-service, Socket bus, file/reactions/cards, bot JWT |

## Architecture (unchanged shape)

```
Flutter Chat tab
  → API Gateway (JWT) ── /sync/chat/*
    → google-sync-service
        → Google Chat API (user refresh token)
        → Postgres: google_chat_spaces (group ↔ space links only)
```

`chat-service` remains unused for Chat tab list/thread/send.

## Diagnose-first (mandatory)

Most proxy code already exists (scopes on Flutter, `/sync/chat/*`, Chat tab UI). “Steps 1–5 all broken” may be **config/token**, not missing features.

**Before writing new feature code**, run and record:

1. `GET /sync/chat/readiness` via gateway with a real user JWT  
2. Confirm stored Google refresh covers Chat scopes (re-consent if not)  
3. GCP: Google Chat API enabled; OAuth consent includes Chat scopes  
4. `GET /sync/chat/spaces` then link → `GET/POST .../messages` via **gateway**  
5. Only then fix code for failures with evidence (logs/status/body)

No speculative rewrites without a failing smoke step.

## Known gaps to close (explicit)

### 1. Identity OAuth scopes out of sync

Flutter `kGoogleSyncScopes` includes Chat; identity `GOOGLE_OAUTH_SCOPES` still stops at Tasks/Sheets/Drive.file.

**Fix:** Add the same Chat scopes to identity defaults used for authorize URL / any server-driven consent path so web PKCE and backend docs match Flutter.

### 2. Silent authorize failure on client

`authorizeServer(kGoogleSyncScopes)` is caught and ignored — login/link can succeed **without** a Chat-capable refresh.

**Fix:** Surface failure when Chat is required for Chat tab (or when readiness returns `needs_reconsent`); do not treat missing serverAuthCode as success for Chat-ready state. Prefer hard CTA to re-link Google.

### 3. Encoded `spaceName` path through gateway

FE uses `Uri.encodeComponent(spaceName)` (`spaces%2F...`). Some Express / `http-proxy-middleware` setups decode `%2F` and break routing.

**Fix order:**

1. Smoke list/send **through gateway** with encoded path  
2. If broken: change API to pass `spaceName` as **query or body** (e.g. `GET /sync/chat/messages?groupId=&spaceName=`) and stop putting resource names with `/` in path segments  

Do not mark message DoD done until gateway smoke passes.

### 4. Personal Gmail expectations

Same UX and APIs as Workspace. If Google returns Chat-unavailable / not enabled → `chat_disabled` blocking UI + help link + Retry / Open Google Chat. **Do not** invent in-app “create Chat account”. Product copy must not promise every `@gmail.com` can chat.

### 5. Poll semantics (honest “sync back”)

- While thread open: poll ~10s (existing) + pull-to-refresh  
- No durable app-side message store  
- No delivery while app closed  
- Acceptable latency for reverse path: ~10–15s when thread open  

Document this in runbook so “đồng bộ ngược” is not confused with bridge mirror.

## In-scope work layers

| Layer | Work |
|-------|------|
| OAuth / token | Align identity Chat scopes; re-consent path; stop silent Chat auth failure |
| Readiness | Reliable `ready` / `needs_reconsent` / `chat_disabled` / `error` + FE gates |
| Link | OWNER/ADMIN picker + unlink; members wait; empty CTAs |
| Messages | List/send text; fix path encoding or switch to query/body; clear `NOT_LINKED` errors |
| Poll | Keep open-thread poll; stop on close/switch; don’t wipe thread on transient poll error |
| Ops | Extend runbook: GCP enablement, scope list, gateway smoke, Gmail disabled, `%2F` issue |
| Leave / create-task | Keep existing behavior; fix only if smoke proves broken (not primary this doc) |

## Out of scope

- Ingest Google → `chat-service` / Socket realtime (former approach B)  
- Egress bridge stub completion as product path  
- File upload, reactions, rich cards, threaded replies parity  
- Guaranteed realtime (WebSocket to Google or app)  
- Changing Sheets/Tasks sync beyond shared consent bundle  

## Error handling

| Case | Behavior |
|------|----------|
| Missing Chat scopes / no refresh | `needs_reconsent` → Relink Google |
| Chat not enabled | `chat_disabled` → help + Retry / Open Google Chat |
| Space not linked to group | 403 `NOT_LINKED`; no blind Google call |
| User not in Google space | Clear error on open/send; admin may unlink |
| Google rate limit | Backoff + toast; don’t tighten poll into a storm |
| Poll failure after successful send | Keep existing messages; show soft error |

## Definition of Done

Pass for at least one Workspace user; attempt personal Gmail and record either pass or clean `chat_disabled`:

1. After re-consent, readiness is `ready` (or documented `chat_disabled` on Gmail)  
2. Admin links ≥1 space to the group  
3. Send from app appears in Google Chat  
4. Message sent in Google Chat appears in app within ~10–15s while thread open  
5. All of 1–4 verified via **gateway** URLs used by Flutter  
6. Identity + Flutter Chat scopes aligned; Chat authorize failure is visible when blocking Chat  

## Testing

- Unit: readiness classifier, link upsert (existing tests; extend if scope helpers added)  
- Smoke: curl/runbook through gateway (readiness, spaces, link, list, send)  
- Manual Chrome: empty CTA → link → thread send → poll receive; Relink on `needs_reconsent`; Gmail disabled screen  
- Regression: Tasks/Sheets consent still works after scope list change  

## File touchpoints (expected)

- `backend/apps/identity-service/src/infra/google-oauth.ts` — Chat scopes  
- `frontend/lib/features/auth/data/google_sign_in_helper.dart` — stop silent Chat auth failure (as needed)  
- `backend/apps/google-sync-service/src/modules/chat/**` — path/query fix if gateway breaks `%2F`  
- `frontend/lib/features/home/data/google_chat_repository.dart` — match API shape if path changes  
- `frontend/lib/features/chat/**` — readiness / reconsent UX gaps only  
- `backend/docs/runbooks/google-chat-oauth-proxy.md` — diagnose-first + gateway smoke + Gmail limits  

Prefer minimal diffs; do not resurrect native Chat tab as primary UX.

## Relation to prior plan

`docs/superpowers/plans/2026-09-29-google-chat-oauth-proxy.md` may still show open checkboxes while code exists. This design **supersedes execution priority**: diagnose → fix proven gaps → close DoD. A new implementation plan should be written from **this** spec, not by blindly re-running every unchecked checkbox.
