import { describe, expect, it } from "vitest";
import { collectShareEmails, isAlreadySharedError } from "../src/modules/sync/sheets-share.js";

describe("sheets-share", () => {
  it("collectShareEmails prefers primary Google email per user", () => {
    const emails = collectShareEmails([
      { userId: "u1", email: "a@x.com", isPrimary: false },
      { userId: "u1", email: "primary@x.com", isPrimary: true },
      { userId: "u2", email: null, isPrimary: true },
      { userId: "u3", email: "m@y.com", isPrimary: true },
    ]);
    expect(emails.sort()).toEqual(["m@y.com", "primary@x.com"]);
  });

  it("isAlreadySharedError detects duplicate permission", () => {
    expect(
      isAlreadySharedError({ code: 403, errors: [{ reason: "alreadyExists" }] }),
    ).toBe(true);
    expect(isAlreadySharedError(new Error("boom"))).toBe(false);
  });
});
