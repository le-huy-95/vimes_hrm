# Multi-Google link gate + Primary rebind (hướng 1)

**Date:** 2026-09-28  
**Status:** Approved (brainstorming)  
**Scope:** Identity + Sync UI — email users must link Google before app; multi-Google accounts; switch Primary with confirm + rebind (option B).

## 1. Goals

1. **Email/password login:** after auth, if user has zero `UserGoogleAccount`, force `/link-google` before Home/Tasks/Chat/Sync.
2. **Google login:** no gate (already has ≥1 Google account). On Sync, allow **link additional** Google accounts (different email allowed).
3. **Primary:** only `isPrimary: true` is used for Tasks/Sheets/Drive sync (unchanged poll path).
4. **Switch Primary:** confirmation dialog → clear this user’s Google bridges → rebind with new Primary (Vimes-native task/chat data preserved).

## 2. Non-goals (Alpha)

- Migrate/copy tasks, sheets, or Chat spaces on Google to the new account.
- Dedicated Settings “Google accounts” screen (accounts managed on Sync tab).
- Unlinking the sole primary (would bypass gate).
- Parallel sync from multiple Google accounts at once.

## 3. User flows

### 3.1 Email/password → mandatory first link

1. Login succeeds → client loads `/auth/me`.
2. If `googleAccounts.length == 0` → router only allows `/link-google` (and logout).
3. User completes Google Sign-In (Tasks + Spreadsheets + Drive.file scopes) → `POST /auth/google/link-id-token`.
4. First linked account becomes **Primary**.
5. Refresh session/`googleAccounts` → navigate `/home`.

**First-link email rule:** Google email must match Vimes user email (`GOOGLE_EMAIL_MISMATCH` if not). This keeps email-login identity coherent.

### 3.2 Google login → optional add more

1. User already has Google account(s) → enter app normally.
2. Sync tab shows account list + **Liên kết thêm Google**.
3. Additional links: **different Google email allowed** (no `GOOGLE_EMAIL_MISMATCH`).
4. New links are non-primary unless user later sets Primary.

### 3.3 Switch Primary

1. User taps **Đặt làm Primary** on a non-primary account.
2. Dialog warns: existing Google Task links / Sheet mappings owned by user / Chat Google bridges will be disconnected; Vimes data kept.
3. On confirm → `POST /auth/google/accounts/:googleSub/primary`.
4. Snackbar + refresh Sync status / `/auth/me`.

## 4. Backend

### 4.1 Endpoints

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| `POST` | `/auth/google/link-id-token` | Bearer | Upsert Google account for current user. Relax multi-sub block. Email match **only** when user has zero Google accounts. |
| `GET` | `/auth/me` | Bearer | Include `googleAccounts` (prefer including Google email if stored or available). |
| `POST` | `/auth/google/accounts/:googleSub/primary` | Bearer | Set Primary + run rebind in a DB transaction scoped to `userId`. |
| `DELETE` | `/auth/google/accounts/:googleSub` | Bearer | Optional Alpha: unlink non-primary only. |

Existing PKCE `POST /auth/google/link` remains for web; Flutter uses `link-id-token`.

### 4.2 Link rules (replace Alpha single-primary lock)

- Remove “only one Google forever” (`GOOGLE_ALREADY_LINKED` when another primary exists with different `sub`).
- Still reject if `googleSub` belongs to another Vimes user (`GOOGLE_TAKEN`).
- First account: `isPrimary = true`. Further accounts: `isPrimary = false` unless set later.
- Store Google email on account row if schema allows; otherwise surface from link response / me enrichment. If schema lacks email column, add `email String?` on `UserGoogleAccount` (small migration) so Sync list can show email.

### 4.3 Rebind on set-primary (option B)

In one transaction for `userId`:

1. Set all user’s accounts `isPrimary = false`; set target `isPrimary = true`.
2. Delete all `GoogleTaskLink` where `userId = user`.
3. For `GroupSheet` where `ownerUserId = user`: clear Google file ids / hashes; set status so client must **Ensure** again; deactivate related `DriveWatchChannel` for those groups.
4. Chat: for Google Chat spaces/bridges tied to groups the user owns or that are clearly bound via this user’s sync (implement with the narrowest safe scope available in schema — prefer group sheets/spaces where user is owner; do not delete Vimes `Message` / `Conversation`). Set ingest/watch to disabled / needs reconnect.
5. Reset primary account sync cursors (`tasksSyncCursor`, poll fields) on the new primary as needed; cancel or mark obsolete sync jobs for this user that are `AUTH_REQUIRED` / stuck on old credentials.
6. After commit: `notifyGoogleTaskPull(userId)`.

**Performance:** rare path; scoped by `userId` / `ownerUserId`. If deletes are large, may return after transaction completes (sync UX shows loading on button). No change to hot-path “read primary for poll”.

### 4.4 Errors

| Code | When |
|------|------|
| `GOOGLE_EMAIL_MISMATCH` | First link only; emails differ |
| `GOOGLE_TAKEN` | Sub linked to another user |
| `GOOGLE_EMAIL_UNVERIFIED` | Google email not verified |
| `NOT_FOUND` | `googleSub` not owned by caller on set-primary |
| `UNAUTHORIZED` | Missing/invalid Bearer |

## 5. Frontend

### 5.1 Auth state

- After login / bootstrap / successful link / set-primary: refresh `/auth/me` and keep `googleAccounts` on authenticated session (extend `AuthAuthenticated` or parallel cache) so router redirect is correct.

### 5.2 Router

- New route: `/link-google`.
- If `AuthAuthenticated` && `googleAccounts.isEmpty` → redirect to `/link-google` (block shell tabs).
- If has accounts && on `/link-google` → `/home`.
- Logout always available on gate page.

### 5.3 Pages

**`LinkGooglePage`:** title, short copy, primary CTA Liên kết Google, logout. Reuse `requestGoogleSignInTokens` + `linkGoogleWithIdToken`.

**`SyncTabPage` — Tài khoản Google block:**

- List accounts (email, personal/workspace, Primary badge).
- CTA Liên kết thêm Google.
- Non-primary: Đặt làm Primary → confirm dialog → API.
- Primary: re-auth when `authRequired` / missing refresh (existing CTA).
- Keep pull / Sheet sections as today.

## 6. Testing

- Email login with no Google → cannot open `/home`; after link → can.
- Google login → no gate; Sync shows add-account.
- Link second Google (different email) succeeds; still one primary.
- Set primary with confirm → user’s task links gone; owned sheets reset; Vimes tasks/messages remain; sync uses new primary.
- Poller/sync status still resolves single `isPrimary: true`.

## 7. Decisions log

| Topic | Choice |
|-------|--------|
| Multi-Google emails | Allowed on additional links (B) |
| Switch Primary data | Rebind B — clear bridges, no Google-side migrate |
| Confirm UX | Dialog before set-primary (A) |
| Product shape | Approach 1 — gate + manage on Sync |
| Performance | Hot path unchanged; rebind scoped & rare |

## 8. Implementation notes

- Prefer extending existing `link-id-token` + Sync UI rather than new settings feature.
- Schema: add nullable `email` on `UserGoogleAccount` if missing (for list UI).
- Do not force-gate users who already linked Google but lack refresh token — they enter app; Sync shows re-auth / `googleLinked: false` as today.
