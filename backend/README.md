# Backend — Phase 0 foundation (v2.5)

Node.js LTS + Express + TypeScript monorepo (`pnpm` + Turborepo).

## Layout

```
backend/
  apps/hello-producer   # publishes HelloSaid via outbox → Kafka
  apps/hello-consumer   # consumes hello.events (idempotent)
  packages/common
  packages/contracts
  packages/kafka-client
  packages/outbox       # in-memory for Phase 0; Postgres in Phase 1
  packages/storage      # MinIO StorageProvider
  packages/cache-keys
  infra/docker-compose.yml
```

Phase 1 will add: `api-gateway`, `identity-service`, `core-service`, `messaging-service` (email stub), etc.

## Prerequisites

- Node 20+
- pnpm 9 (`npx pnpm@9.15.0` nếu chưa cài global)
- Docker Desktop

## Setup

```bash
cd backend
cp .env.example .env
pnpm install
pnpm build
pnpm test
```

## Infra

Ports (tránh conflict máy local): Postgres `15432`, Redis `16379`, MinIO `9000/9001`, Kafka `9092`.

```bash
cd infra
docker compose up -d
docker compose ps
```

## Hello event (manual E2E)

Terminal 1:

```bash
cd backend
pnpm --filter @manage-teams/hello-consumer dev
```

Terminal 2:

```bash
pnpm --filter @manage-teams/hello-producer dev
curl -s -X POST http://localhost:3101/hello -H 'content-type: application/json' -d '{"message":"ping"}'
curl -s http://localhost:3102/seen
```

Or one-shot publish:

```bash
pnpm --filter @manage-teams/hello-producer exec tsx src/send-once.ts
```

## Spec

See `docs/superpowers/specs/2026-09-28-ke-hoach-trien-khai-v2.5-design.md` Phase 0.
