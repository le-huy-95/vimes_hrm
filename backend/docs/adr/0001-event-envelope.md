# ADR 0001: Event envelope and topic naming

## Status

Accepted (Phase 0)

## Context

Services communicate state changes via Kafka. Clients need a stable envelope for idempotency, ordering, and audit (`actor.via`).

## Decision

- One topic per aggregate family (e.g. `task.events`, `hello.events` for Phase 0 demo).
- Envelope fields: `eventId`, `eventType`, `aggregateType`, `aggregateId`, `aggregateVersion`, `occurredAt`, `correlationId`, `actor.via`, `payload`.
- Consumers track `processed_events` / idempotent handlers; ignore duplicates by `eventId`.
- Producers use transactional outbox (in-memory in Phase 0; Postgres in Phase 1).

## Consequences

- Shared Zod schemas live in `@manage-teams/contracts`.
- Breaking envelope changes require a new `eventType` or versioned payload, not silent field renames.
