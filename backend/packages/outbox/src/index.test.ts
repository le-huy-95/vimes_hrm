import { describe, expect, it } from "vitest";
import { InMemoryOutbox } from "./index.js";
import type { EventEnvelope } from "@manage-teams/contracts";

function sample(eventId: string): EventEnvelope {
  return {
    eventId,
    eventType: "HelloSaid",
    aggregateType: "hello",
    aggregateId: "h1",
    aggregateVersion: 1,
    occurredAt: new Date().toISOString(),
    correlationId: "c1",
    actor: { via: "system" },
    payload: {},
  };
}

describe("InMemoryOutbox", () => {
  it("is idempotent on processed events", () => {
    const box = new InMemoryOutbox();
    expect(box.markProcessed("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(box.markProcessed("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("tracks pending publish", () => {
    const box = new InMemoryOutbox();
    const id = "550e8400-e29b-41d4-a716-446655440001";
    box.enqueue("hello.events", sample(id));
    expect(box.pending()).toHaveLength(1);
    box.markPublished(id);
    expect(box.pending()).toHaveLength(0);
  });
});
