import { describe, expect, it } from "vitest";
import { parseEnvelope } from "./index.js";

describe("EventEnvelope", () => {
  it("parses a valid envelope", () => {
    const env = parseEnvelope({
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      eventType: "HelloSaid",
      aggregateType: "hello",
      aggregateId: "h1",
      aggregateVersion: 1,
      occurredAt: new Date().toISOString(),
      correlationId: "c1",
      actor: { via: "system" },
      payload: { message: "hi" },
    });
    expect(env.eventType).toBe("HelloSaid");
  });
});
