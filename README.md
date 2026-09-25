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

## Client (repo riêng)

UI Flutter nằm ở sibling repo **`manage-teams-app`** (`../manage-teams-app`), không còn trong thư mục `web/` của API.

```bash
# Terminal 1 — API (repo này)
npm run dev   # → http://localhost:3002/health

# Terminal 2 — Flutter client
cd ../manage-teams-app
cp -n .env.example .env
flutter pub get
flutter run -d chrome
```

Sau `flutter run -d chrome`, copy origin từ address bar vào Google OAuth **Authorized JavaScript origins** và đặt `WEB_ORIGIN` trong `.env` API cho khớp — xem [`docs/GOOGLE_OAUTH.md`](docs/GOOGLE_OAUTH.md).

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
