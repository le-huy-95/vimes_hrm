# Phase 1 Auth Email (Vimes) — Design Spec

**Date:** 2026-09-28  
**Status:** Draft — awaiting user review  
**Parent:** [v2.5 deployment plan](./2026-09-28-ke-hoach-trien-khai-v2.5-design.md)  
**Reference implementation (pattern only):** `test-y-Backend` (`AuthMailer` port, OTP handlers, Handlebars templates)  
**Brand in copy:** **Vimes** (do not reuse y-Backend / tenant product strings)

## Goal

Ship Phase 1 email for login-related flows using the y-Backend architecture pattern (ports + typed handlers + HTML templates + SMTP), with **Manage Teams / Vimes** wording and org-scoped invites — not a verbatim port of templates or subjects.

## Scope

### In scope

1. **OTP verify email** (`verify_email`) — after register / resend.
2. **OTP password reset** (`reset_password`) — forgot + reset with OTP.
3. **Organization invite email** — invite to **Organization** only (not group).
4. Wiring:
   - `identity-service` owns OTP lifecycle + `AuthMailer` HTTP client.
   - `core-service` owns `org_invitations` + accept API; sends invite mail via messaging.
   - `messaging-service` owns Handlebars templates, SMTP (or dev inbox), typed internal endpoints.

### Out of scope

- Group-level invite emails.
- SMS OTP.
- Full Google OAuth (covered by v2.5; not this doc’s focus).
- Flutter API wiring details (implementation plan).
- Google Chat / digest (later messaging phases).

## Architecture

```
Flutter
  │ REST (via api-gateway later)
  ├─► identity-service ──AuthMailer──► messaging POST /internal/email/otp|password-reset-otp
  └─► core-service ──InviteMailer───► messaging POST /internal/email/org-invite

messaging-service
  templates (Handlebars) + layout
  nodemailer SMTP if configured
  else in-memory sent[] + GET /internal/email/sent (dev)
```

### Service boundaries

| Service | Owns | Does not own |
|---------|------|----------------|
| identity | Users, password hash, OTP rows, JWT/refresh, AuthMailer port | HTML templates, org membership |
| core | organizations, org_members, org_invitations, accept invite | OTP codes for auth |
| messaging | Templates, send, emailType logging, internal email APIs | Auth business rules |

All internal email routes require header `x-internal-token` matching `INTERNAL_SERVICE_TOKEN`. Not exposed on public gateway routes.

## OTP (identity) — adapted from y-Backend

- 6-digit OTP; store **SHA-256 hash only**; TTL default **10 minutes** (`OTP_EXPIRES_MINUTES`).
- Purposes: `verify_email` | `reset_password` (never interchangeable).
- `issueOtp` → persist → call AuthMailer; in `development`, may log OTP to server log for local test.
- `verifyOtp` → latest unconsumed non-expired row for purpose → mark consumed; set `email_verified_at` when verifying email.
- `requestPasswordReset` → **always** return the same generic Vietnamese message (anti-enumeration), whether or not the email exists.
- `resetPasswordWithOtp` → verify → update password hash → bump `token_version` / revoke refresh tokens.
- Rate limits (align v2.5): OTP send 5/hour/email; OTP try 5 / 10 minutes then temporary lock; login 10/min/IP on gateway when present.

## Organization invite (core)

- Only org **OWNER** or **ADMIN** can create invites.
- Store: email, orgId, role, opaque token, expiresAt (default 72h), createdBy, consumedAt.
- Email contains accept URL: `{APP_PUBLIC_URL}/invites/org?token=...` (Flutter deep link / web route).
- Accept: authenticated user whose email matches invite (or policy: allow link-then-bind) → insert `org_members`; mark invite consumed; 410 if expired/used.
- No OTP inside invite URL.

## messaging-service APIs

| Method | Path | Body (conceptual) |
|--------|------|-------------------|
| POST | `/internal/email/otp` | `to`, `userName?`, `otpCode`, `expiryMinutes`, `userId?` |
| POST | `/internal/email/password-reset-otp` | same shape |
| POST | `/internal/email/org-invite` | `to`, `orgName`, `roleLabel`, `inviterName`, `acceptUrl`, `expiryHours`, `userId?` |
| GET | `/internal/email/sent` | dev inbox (internal token) |

Low-level `POST /internal/email/send` may remain for ops/debug but auth/invite flows **must** use typed endpoints so subjects/templates stay consistent.

### Templates

- Engine: Handlebars (as in y-Backend).
- Files under messaging, e.g. `templates/layout.hbs`, `otp.hbs`, `org-invite.hbs`.
- `siteName` / brand string: **Vimes**.

### Copy requirements (must customize — examples, not y-Backend clones)

| Type | Subject (example) | Body intent |
|------|-------------------|-------------|
| OTP verify | `Mã xác minh Vimes` | Greeting; large OTP; expiry; do not share; context = Vimes account / team management |
| OTP reset | `Đặt lại mật khẩu Vimes` | Security warning if unexpected; code only for password reset |
| Org invite | `Lời mời vào tổ chức {orgName} trên Vimes` | Inviter, role, CTA link, expiry |

Tests must assert brand **Vimes** appears and must **not** assert leftover strings from y-Backend product naming.

## Errors & ops

- SMTP failure: identity/core surface 503 where appropriate; forgot-password still returns generic success message.
- No SMTP in env: append to in-memory sent list; 202; inspect via `/internal/email/sent`.
- Do not log plaintext OTP in production; redact in structured logs.

## Testing

- Unit: template render (Vimes subjects/body).
- Unit: OTP hash/verify/consume; purpose isolation; forgot enumeration.
- Unit/integration: AuthMailer / InviteMailer HTTP client against messaging mock.
- Contract: Zod schemas for internal email bodies.

## Relation to existing stub

Current `messaging-service` `sendEmail` + `/internal/email/send` is the transport seed. Phase 1 extends it with templates + typed handlers; identity/core stop sending ad-hoc HTML strings for auth/invite.

## Open defaults

| Item | Default |
|------|---------|
| OTP TTL | 10 minutes |
| Invite TTL | 72 hours |
| APP_PUBLIC_URL | env (e.g. Flutter web origin) |
| SMTP | optional until configured |

## Success criteria

- Register → receive Vimes verify OTP email (or dev inbox).
- Forgot password → generic API message; inbox gets reset OTP when user exists.
- Org admin invites email → Vimes org-invite mail with working token accept path (API level).
- No copied y-Backend marketing/subject strings in production templates.
