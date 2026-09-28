import { randomUUID } from "node:crypto";
import type { EventEnvelope } from "@manage-teams/contracts";
import type { InMemoryOutbox } from "@manage-teams/outbox";

export function buildHelloEnvelope(message: string, correlationId = randomUUID()): EventEnvelope {
  return {
    eventId: randomUUID(),
    eventType: "HelloSaid",
    aggregateType: "hello",
    aggregateId: "hello-1",
    aggregateVersion: 1,
    occurredAt: new Date().toISOString(),
    correlationId,
    actor: { via: "system" },
    payload: { message },
  };
}

export async function relayOutbox(
  outbox: InMemoryOutbox,
  publish: (topic: string, envelope: EventEnvelope) => Promise<void>,
): Promise<number> {
  const pending = outbox.pending();
  for (const row of pending) {
    await publish(row.topic, row.envelope);
    outbox.markPublished(row.id);
  }
  return pending.length;
}
