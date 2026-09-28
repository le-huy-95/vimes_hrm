import { createLogger } from "@manage-teams/common";
import type { EventEnvelope } from "@manage-teams/contracts";
import { InMemoryOutbox } from "@manage-teams/outbox";

const logger = createLogger("hello-consumer-handler");
export const processedStore = new InMemoryOutbox();
export const seen: EventEnvelope[] = [];

export function handleHelloEvent(envelope: EventEnvelope): boolean {
  const first = processedStore.markProcessed(envelope.eventId);
  if (!first) {
    logger.info({ eventId: envelope.eventId }, "duplicate ignored");
    return false;
  }
  seen.push(envelope);
  logger.info({ eventId: envelope.eventId, payload: envelope.payload }, "hello handled");
  return true;
}
