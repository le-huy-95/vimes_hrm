import type { EventEnvelope } from "@manage-teams/contracts";

/** In-memory outbox for Phase 0 hello-event. Phase 1 replaces with Postgres transactional outbox. */
export type OutboxRecord = {
  id: string;
  topic: string;
  envelope: EventEnvelope;
  createdAt: Date;
  publishedAt: Date | null;
};

export class InMemoryOutbox {
  private readonly rows = new Map<string, OutboxRecord>();
  private readonly processed = new Set<string>();

  enqueue(topic: string, envelope: EventEnvelope): OutboxRecord {
    const row: OutboxRecord = {
      id: envelope.eventId,
      topic,
      envelope,
      createdAt: new Date(),
      publishedAt: null,
    };
    this.rows.set(row.id, row);
    return row;
  }

  pending(): OutboxRecord[] {
    return [...this.rows.values()].filter((r) => r.publishedAt === null);
  }

  markPublished(id: string): void {
    const row = this.rows.get(id);
    if (row) row.publishedAt = new Date();
  }

  /** Idempotent consumer helper: returns false if already processed. */
  markProcessed(eventId: string): boolean {
    if (this.processed.has(eventId)) return false;
    this.processed.add(eventId);
    return true;
  }

  hasProcessed(eventId: string): boolean {
    return this.processed.has(eventId);
  }
}
