export type ChatReadiness =
  | { status: "ready" }
  | { status: "needs_reconsent"; reason: string }
  | { status: "chat_disabled"; reason: string }
  | { status: "error"; reason: string };

export function classifyChatProbeError(input: {
  code?: string;
  httpStatus?: number;
  message: string;
}): ChatReadiness {
  const msg = input.message.toLowerCase();
  if (input.code === "AUTH_REQUIRED" || msg.includes("invalid_grant")) {
    return { status: "needs_reconsent", reason: input.code ?? "AUTH_REQUIRED" };
  }
  if (msg.includes("insufficient") && msg.includes("scope")) {
    return { status: "needs_reconsent", reason: "INSUFFICIENT_SCOPES" };
  }
  if (
    msg.includes("chat is not enabled") ||
    msg.includes("not a chat user") ||
    msg.includes("google chat app")
  ) {
    return { status: "chat_disabled", reason: input.message };
  }
  if (input.httpStatus === 403 || input.httpStatus === 404) {
    return { status: "chat_disabled", reason: input.message };
  }
  return { status: "error", reason: input.message };
}
