import { describe, expect, it } from "vitest";
import { GchatService } from "./gchat.service.js";

describe("GchatService.ingestGoogleEvent", () => {
  it("ignores payloads without ids", async () => {
    const gchat = {
      findSpaceByGoogleId: async () => null,
      insertMessageIdempotent: async () => ({ created: true, row: null }),
      touchHealth: async () => ({}),
      markMessageConfirmed: async () => ({}),
    };
    const teams = { findById: async () => null };
    const svc = new GchatService(gchat as never, teams as never);
    const result = await svc.ingestGoogleEvent({});
    expect(result).toEqual({ ignored: true, reason: "missing_ids" });
  });
});
