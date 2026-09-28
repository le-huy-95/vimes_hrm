import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { EventEnvelope } from "@manage-teams/contracts";
import { handleHelloEvent } from "./handler.js";

function env(eventId: string): EventEnvelope {
  return {
    eventId,
    eventType: "HelloSaid",
    aggregateType: "hello",
    aggregateId: "hello-1",
    aggregateVersion: 1,
    occurredAt: new Date().toISOString(),
    correlationId: "c1",
    actor: { via: "system" },
    payload: { message: "hi" },
  };
}

describe("handleHelloEvent", () => {
  it("processes once and ignores duplicate", () => {
    const id = randomUUID();
    expect(handleHelloEvent(env(id))).toBe(true);
    expect(handleHelloEvent(env(id))).toBe(false);
  });
});
