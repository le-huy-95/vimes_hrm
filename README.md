# Manage Teams API (Phase 1)

## Quick start

```bash
# 1. Infra
cp .env.example .env
docker compose up -d

# 2. DB
npm install
npx prisma migrate dev --name phase1_foundation
npm run prisma:seed

# 3. API
npm run dev
# → http://localhost:3001/health
```

## Web (sibling repo)

Web scaffold lives in `./web` for now (sandbox could not create `../manage-teams-web`). Move when ready:

```bash
mv web ../manage-teams-web
cd ../manage-teams-web
cp .env.example .env
npm install
npm run dev
# → http://localhost:5173
```

Or run in place:

```bash
cd web && npm install && npm run dev
```

## Google OAuth (login)

Hướng dẫn chi tiết: [`docs/GOOGLE_OAUTH.md`](docs/GOOGLE_OAUTH.md)

Cần điền vào `.env` (API):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL=http://localhost:3002/auth/google/callback`

Authorized redirect URI in Google Cloud Console must match callback URL.

## Docs

- Design: `docs/superpowers/specs/2026-09-25-phase1-foundation-design.md`
- Plan: `docs/superpowers/plans/2026-09-25-phase1-foundation.md`
- OpenAPI: `openapi/openapi.yaml`

## Manual smoke checklist

1. Register at `/register` (creates org)
2. Create team, confirm you are lead
3. Home → Add organization user → invite that email on a team
4. Second browser/login as member → can view, cannot edit team
