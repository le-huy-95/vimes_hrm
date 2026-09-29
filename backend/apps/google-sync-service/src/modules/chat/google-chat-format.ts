/**
 * Parse payload kiểu Google Chat HTTP app (MESSAGE / CARD_CLICKED).
 * Dev có thể gửi shape rút gọn; production gửi event đầy đủ từ Google.
 */
export type ParsedChatWebhook = {
  eventId: string;
  type: string;
  action?: string;
  userId?: string;
  groupId?: string;
  taskCode?: string;
  askText?: string;
  spaceName?: string;
  messageName?: string;
  messageText?: string;
  raw: unknown;
};

export function parseGoogleChatWebhook(body: unknown): ParsedChatWebhook | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  // Shape nội bộ (dev / internal)
  if (typeof b.eventId === "string" && (b.action || b.type)) {
    return {
      eventId: b.eventId,
      type: String(b.type ?? "INTERNAL"),
      action: b.action ? String(b.action) : undefined,
      userId: b.userId ? String(b.userId) : undefined,
      groupId: b.groupId ? String(b.groupId) : undefined,
      taskCode: b.taskCode ? String(b.taskCode) : undefined,
      askText: b.askText ? String(b.askText) : undefined,
      spaceName: b.spaceName ? String(b.spaceName) : undefined,
      raw: body,
    };
  }

  // Google Chat event
  const type = String(b.type ?? b.eventType ?? "");
  const eventId =
    (typeof b.eventTime === "string" ? b.eventTime : null) ??
    (typeof b.eventId === "string" ? b.eventId : null) ??
    `gchat-${Date.now()}`;

  const message = (b.message as Record<string, unknown> | undefined) ?? undefined;
  const action = (b.action as Record<string, unknown> | undefined) ?? undefined;
  const user = (b.user as Record<string, unknown> | undefined) ?? undefined;
  const space = (b.space as Record<string, unknown> | undefined) ?? undefined;

  const spaceName = space?.name ? String(space.name) : undefined;
  const messageName = message?.name ? String(message.name) : undefined;
  const messageText = message?.text ? String(message.text) : undefined;

  // CARD_CLICKED — action.actionMethodName = COMPLETE_TASK
  if (type === "CARD_CLICKED" || action) {
    const method = String(action?.actionMethodName ?? action?.action ?? "");
    const params = (action?.parameters as Array<{ key?: string; value?: string }> | undefined) ?? [];
    const get = (k: string) => params.find((p) => p.key === k)?.value;
    return {
      eventId: `${eventId}:${method}:${get("taskCode") ?? ""}`,
      type: "CARD_CLICKED",
      action: method || "COMPLETE_TASK",
      userId: get("userId") ?? (user?.name ? undefined : undefined),
      groupId: get("groupId"),
      taskCode: get("taskCode"),
      spaceName,
      messageName,
      raw: body,
    };
  }

  // MESSAGE — slash / mention
  if (type === "MESSAGE" && messageText) {
    const text = messageText.trim();
    if (text.startsWith("/complete ") || text.startsWith("/done ")) {
      const taskCode = text.split(/\s+/)[1];
      return {
        eventId: `${eventId}:complete:${taskCode}`,
        type: "MESSAGE",
        action: "COMPLETE_TASK",
        taskCode,
        spaceName,
        messageName,
        messageText: text,
        raw: body,
      };
    }
    if (text.startsWith("/ask ") || text.includes("@ManageTeams")) {
      const askText = text.replace(/^\/ask\s+/, "").replace(/@ManageTeams/gi, "").trim();
      return {
        eventId: `${eventId}:ask`,
        type: "MESSAGE",
        action: "ASK_BOT",
        askText,
        spaceName,
        messageName,
        messageText: text,
        raw: body,
      };
    }
  }

  return {
    eventId: String(eventId),
    type: type || "UNKNOWN",
    spaceName,
    messageName,
    messageText,
    raw: body,
  };
}

/** Card Google Chat (JSON đơn giản — Adaptive Card-like stub). */
export function buildTaskCompleteCard(input: {
  taskCode: string;
  groupId: string;
  userId: string;
  title: string;
}): Record<string, unknown> {
  return {
    cardsV2: [
      {
        cardId: `task-${input.taskCode}`,
        card: {
          header: { title: input.title, subtitle: input.taskCode },
          sections: [
            {
              widgets: [
                {
                  buttonList: {
                    buttons: [
                      {
                        text: "Hoàn thành",
                        onClick: {
                          action: {
                            function: "COMPLETE_TASK",
                            parameters: [
                              { key: "taskCode", value: input.taskCode },
                              { key: "groupId", value: input.groupId },
                              { key: "userId", value: input.userId },
                            ],
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

export function buildTextCard(header: string, text: string): Record<string, unknown> {
  return {
    cardsV2: [
      {
        cardId: `text-${Date.now()}`,
        card: {
          header: { title: header },
          sections: [{ widgets: [{ textParagraph: { text } }] }],
        },
      },
    ],
  };
}
