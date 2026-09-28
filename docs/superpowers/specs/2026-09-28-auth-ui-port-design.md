# Auth UI Port (Approach A) — Design Spec

**Date:** 2026-09-28  
**Project:** manage-teams / frontend  
**Source:** VIMES frontend (`b-i-test-l-p-tr-nh-VIMES-frontend`)  
**Status:** Draft — awaiting user review  

## Goal

Port **auth screens UI only** from VIMES into Manage Teams Flutter client, with navigation between screens. **No API, Bloc, repository, Google Sign-In, or Firebase auth** in this phase.

## Scope

### In scope

| Screen | Route | Notes |
|--------|-------|--------|
| Login | `/login` | Email/SĐT + password, remember me, Google button (stub), links to register/forgot |
| Register | `/register` | Form UI + navigate to OTP on submit (stub) |
| Forgot password | `/forgot-password` | Email form → navigate to reset (stub) |
| Verify OTP | `/verify-otp` | Pin input UI; resend/submit stub |
| Reset password | `/reset-password` | OTP + new password UI; submit → login stub |

Supporting UI:

- `AuthTextField`, `AuthPrimaryButton`
- Brand logo widget (reuse current asset or rename widget to `AppLogo`; keep `vimes_logo.png` until new brand asset exists)
- Minimal `AppHeader` **auth variant only** (no notification bell / feature deps)
- `go_router` auth routes; app starts at `/login`

Copy / microcopy: keep Vietnamese layout; adjust product-specific lines (e.g. subtitle “quản lý kho…” → generic Manage Teams wording).

### Out of scope

- Select tenant screen
- AuthBloc / LoginBloc / RegisterBloc / OtpBloc / ForgotPasswordBloc / ResetPasswordBloc
- `AuthRepository`, `AuthApiService`, models, GoogleAuthService
- `StorageManager` remember-credentials persistence (optional later)
- Session redirect / auth guards
- Real Google Sign-In / Firebase

Stub behavior:

- Primary actions: form validate → snackbar “Sắp có” **or** navigate to next screen in the happy-path demo flow
- Google button: snackbar only
- Loading states: local `bool` on button press if useful for visual parity; no Bloc

## Demo navigation (happy path)

```
/login ──Đăng ký──► /register ──Submit──► /verify-otp ──Submit──► /login (+ success snackbar)
/login ──Quên MK──► /forgot-password ──Submit──► /reset-password ──Submit──► /login
```

Query/extra args (email/phone) may be passed via `go_router` `extra` for display on OTP/reset pages (UI only).

## File layout

```
lib/
  app/
    app.dart              # MaterialApp.router
    app_theme.dart        # existing
    router/app_router.dart
  features/auth/
    pages/
      login_page.dart
      register_page.dart
      forgot_password_page.dart
      verify_otp_page.dart
      reset_password_page.dart
    widgets/
      auth_text_field.dart
      auth_primary_button.dart
      app_logo.dart
  shared/widgets/
    app_header.dart       # auth/detail variants; no AppNotificationBell
```

## App wiring

- Replace design-preview home with `GoRouter` initialLocation `/login`
- Keep existing theme, BotToast, localizations
- `main.dart` unchanged aside from still loading `.env` (unused by auth UI)

## Branding

- Widget: `AppLogo` (path still `lib/assets/image/vimes_logo.png` until replaced)
- Login title: “Chào mừng trở lại”
- Login subtitle: e.g. “Đăng nhập để quản lý nhóm và dự án” (Manage Teams–neutral)

## Success criteria

- `flutter analyze` clean
- Navigate all five screens on mobile **and** web (`flutter run -d chrome`)
- Visual parity with VIMES auth pages (layout, colors, fields, buttons)
- No network calls from auth UI code

## Follow-up (not this phase)

Wire API + Bloc + storage + Google/Firebase; add tenant select if product needs it.

## Spec self-review

- [x] No unresolved placeholders for in-scope work
- [x] Scope matches user choice (option 2 screens, approach A)
- [x] No contradiction with prior “config/design only” baseline (this adds UI pages only)
- [x] Explicit out-of-scope for logic stack
