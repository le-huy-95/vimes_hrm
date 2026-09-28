import { describe, expect, it } from "vitest";
import { InMemoryOutbox } from "@manage-teams/outbox";
import { TOPICS } from "@manage-teams/contracts";
import { buildHelloEnvelope, relayOutbox } from "./hello.js";

describe("hello-producer outbox relay", () => {
  it("publishes pending rows once", async () => {
    const published: string[] = [];
    const local = new InMemoryOutbox();
    const envelope = buildHelloEnvelope("test");
    local.enqueue(TOPICS.helloEvents, envelope);
    const count = await relayOutbox(local, async (_topic, env) => {
      published.push(env.eventId);
    });
    expect(count).toBe(1);
    expect(published).toEqual([envelope.eventId]);
    expect(local.pending()).toHaveLength(0);
  });

  it("buildHelloEnvelope sets system actor", () => {
    const env = buildHelloEnvelope("x");
    expect(env.actor.via).toBe("system");
    expect(env.eventType).toBe("HelloSaid");
  });
});
