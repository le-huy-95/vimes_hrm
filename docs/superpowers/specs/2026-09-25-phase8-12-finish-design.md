# Phase 8–10 Design — Google Chat Bot (Inbound + Outbound + Health)

**Date:** 2026-09-25  
**Status:** Implementing  
**Scope:** Code scaffold + APIs + StreamingPull worker + renew/backup jobs. Real GCP credentials optional — worker no-ops when disabled.

## Goals
- Tables: `gchat_spaces`, `gchat_dm_mapping`, `gchat_messages` (unique `google_message_id`), `gchat_subscription_health`
- Inbound: Pub/Sub StreamingPull → upsert message by `google_message_id` → if new & source=google emit Socket.IO optional / store only
- Outbound: `POST /teams/:teamId/gchat/spaces/:spaceId/messages` → Bot send → insert pending → confirm on echo
- Jobs: renew subscription, backup poll stub, health stale alert log
- Env: `GCHAT_ENABLED`, `GOOGLE_APPLICATION_CREDENTIALS` / SA JSON, `GCHAT_PUBSUB_SUBSCRIPTION`

## Non-goals
- Full GCP provisioning UI
- Restricted user-impersonation scopes
- Web UI for GChat

---

# Phase 11 Design — Dedup Hardening

- Table `idempotency_keys` (key, userId, route, responseStatus, responseBody, createdAt) UNIQUE(key)
- Middleware for selected POST routes (files/confirm, messages, gchat send)
- Auth rate limit (in-memory sliding window)
- Document existing webhook delivery unique + Redis locks

---

# Phase 12 Design — Tests & Security Baseline

- Vitest + supertest: `/health`, register validation, webhook signature (existing)
- Helmet already on; add `X-Request-Id` middleware
- README section: production checklist
- Mark roadmap phases 1–12 implemented (scaffold where GCP external)

---
