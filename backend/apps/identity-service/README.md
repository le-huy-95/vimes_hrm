# identity-service

**Port:** `3202`  
**Mục đích:** Xác thực & tài khoản — đăng ký, login, OTP, Google OAuth, JWT.

## Modules

| Module | Mục đích |
|--------|----------|
| `modules/login` | Login email/password + Google (authorize-url, callback, id-token) |
| `modules/auth` | Register, verify email, forgot/reset password, `/me`, link Google |

## Infra

- `infra/google-oauth.ts`, `google-accounts.ts` — OAuth / liên kết + scope Tasks + serverAuthCode
- Runbook Tasks: [../../docs/runbooks/google-tasks-sync-setup.md](../../docs/runbooks/google-tasks-sync-setup.md)
- `infra/otp.ts`, `mailer.ts` — OTP + gọi worker gửi email
- `utils/crypto.ts` — Argon2 hash mật khẩu

Gateway proxy: `/auth/*`.
