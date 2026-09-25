# Manage Teams API

Phases **1–12** implemented on `master` (Google Chat Bot is scaffolded; enable with GCP credentials).

## Quick start

```bash
# 1. Infra (Postgres :5433, Redis, MinIO :9010)
cp .env.example .env
docker compose up -d

# 2. DB
npm install
npx prisma migrate deploy
npm run prisma:seed

# 3. API
npm run dev
# → http://localhost:3002/health
```

## Web (Flutter)

Client Flutter thay React Vite. Package: `manage_teams_app` trong `web/`.

```bash
# API phải chạy trước (:3002)
cd web
cp -n .env.example .env   # API_DEV_URL=http://localhost:3002
flutter pub get
flutter run -d chrome
# hoặc: flutter run   (iOS Simulator / Android emulator)
```

Sau `flutter run -d chrome`, copy origin từ address bar (thường `http://localhost:xxxxx`) vào Google OAuth **Authorized JavaScript origins** — xem [`docs/GOOGLE_OAUTH.md`](docs/GOOGLE_OAUTH.md).

Đặt `WEB_ORIGIN` trong API `.env` trùng origin Flutter web để OAuth callback redirect đúng app.

## Google OAuth (login)

See [`docs/GOOGLE_OAUTH.md`](docs/GOOGLE_OAUTH.md).

## Google Chat Bot (Phases 8–10)

Set in `.env`:

- `GCHAT_ENABLED=true`
- `GCHAT_PUBSUB_SUBSCRIPTION=projects/.../subscriptions/...`
- `GCHAT_SERVICE_ACCOUNT_JSON` (or reuse `GOOGLE_SERVICE_ACCOUNT_JSON`)

Without these, Pub/Sub worker stays off; connect/send APIs return 503.

## Production checklist (Phase 12)

- [ ] Strong JWT secrets + `TOKEN_ENCRYPTION_KEY`
- [ ] `COOKIE_SECURE=true` behind HTTPS
- [ ] Rotate GitHub webhook secret / MinIO keys
- [ ] Enable GChat only with least-privilege SA
- [ ] Monitor Redis + BullMQ failed jobs
- [ ] Run `npm test` in CI

## Docs

- Specs/plans: `docs/superpowers/`
- OpenAPI: `openapi/openapi.yaml`

## Manual smoke checklist

1. Register at `/register` (creates org) — Flutter web
2. Create team, confirm you are lead
3. Sidebar → Add organization user → invite that email on a team
4. Second browser/login as member → can view, cannot edit team
5. Team dashboard shows Google Tasks chart + Google/GitHub cards
