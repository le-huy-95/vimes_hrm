import { describe, expect, it } from "vitest";
import { buildLinkUpsertData } from "../src/modules/chat/chat-links.service.js";

describe("buildLinkUpsertData", () => {
  it("maps fields for upsert", () => {
    expect(
      buildLinkUpsertData({
        spaceName: "spaces/AAA",
        groupId: "11111111-1111-1111-1111-111111111111",
        linkedByUserId: "22222222-2222-2222-2222-222222222222",
        displayName: "Team",
        spaceType: "SPACE",
      }),
    ).toEqual({
      spaceName: "spaces/AAA",
      groupId: "11111111-1111-1111-1111-111111111111",
      linkedByUserId: "22222222-2222-2222-2222-222222222222",
      displayName: "Team",
      spaceType: "SPACE",
      status: "ACTIVE",
      chatIngestEnabled: false,
    });
  });
});
