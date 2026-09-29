import { describe, expect, it } from "vitest";
import {
  composePushNotes,
  extractAppTaskId,
  shouldApplyGoogleCompletion,
  shouldApplyGoogleUncomplete,
  splitGoogleNotes,
} from "../src/modules/sync/notes-split.js";
import { parseGoogleChatWebhook, buildTaskCompleteCard } from "../src/modules/chat/google-chat-format.js";

describe("notes-split", () => {
  it("composses marker", () => {
    expect(composePushNotes("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "hi")).toContain("[app:");
    expect(extractAppTaskId(composePushNotes("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "x"))).toBe(
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    );
  });

  it("splits personal before and after marker", () => {
    const s = splitGoogleNotes("chi tiết\n[app:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee]\nextra");
    expect(s.taskId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(s.personal).toBe("chi tiết\nextra");
  });

  it("composses details before marker", () => {
    const notes = composePushNotes("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "mô tả");
    expect(notes.startsWith("mô tả")).toBe(true);
    expect(notes).toContain("[app:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee]");
  });

  it("completion timestamp wins", () => {
    expect(
      shouldApplyGoogleCompletion({
        googleCompleted: true,
        googleCompletedAt: new Date("2026-01-02"),
        localStatus: "DONE",
        localCompletedAt: new Date("2026-01-01"),
        localCompletedSource: "user",
      }),
    ).toBe(true);
    expect(
      shouldApplyGoogleUncomplete({
        googleCompleted: false,
        googleUpdatedAt: new Date("2026-01-02"),
        localStatus: "DONE",
        localCompletedAt: new Date("2026-01-01"),
        localCompletedSource: "google",
      }),
    ).toBe(true);
  });
});

describe("google-chat-format", () => {
  it("parses internal event", () => {
    const p = parseGoogleChatWebhook({
      eventId: "e1",
      action: "COMPLETE_TASK",
      userId: "u",
      taskCode: "T-1",
    });
    expect(p?.action).toBe("COMPLETE_TASK");
  });

  it("parses slash complete", () => {
    const p = parseGoogleChatWebhook({
      type: "MESSAGE",
      eventTime: "2026-01-01T00:00:00Z",
      message: { text: "/complete T-99", name: "spaces/x/messages/y" },
      space: { name: "spaces/x" },
    });
    expect(p?.action).toBe("COMPLETE_TASK");
    expect(p?.taskCode).toBe("T-99");
  });

  it("builds complete card", () => {
    const card = buildTaskCompleteCard({
      taskCode: "T-1",
      groupId: "g",
      userId: "u",
      title: "Do it",
    });
    expect(card.cardsV2).toBeTruthy();
  });
});
