import { describe, expect, it } from "vitest";
import {
  classifyChatProbeError,
  type ChatReadiness,
} from "../src/modules/chat/chat-readiness.js";

describe("classifyChatProbeError", () => {
  it("maps missing refresh / AUTH_REQUIRED to needs_reconsent", () => {
    expect(classifyChatProbeError({ code: "AUTH_REQUIRED", message: "no token" })).toEqual({
      status: "needs_reconsent",
      reason: "AUTH_REQUIRED",
    } satisfies ChatReadiness);
  });

  it("maps 403 chat disabled / not a chat user to chat_disabled", () => {
    expect(
      classifyChatProbeError({
        httpStatus: 403,
        message: "Google Chat is not enabled for the user",
      }),
    ).toMatchObject({ status: "chat_disabled" });
  });

  it("maps insufficient scopes to needs_reconsent", () => {
    expect(
      classifyChatProbeError({
        httpStatus: 403,
        message: "Request had insufficient authentication scopes",
      }),
    ).toMatchObject({ status: "needs_reconsent" });
  });
});
