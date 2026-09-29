import { prismaRead, prismaWrite } from "@manage-teams/db";
import { AppError, createLogger } from "@manage-teams/lib";
import { buildTextCard } from "./google-chat-format.js";
import { sendChatEmailFallback } from "./bridge.service.js";

const logger = createLogger("google-sync-service");
const verificationToken =
  process.env.GOOGLE_CHAT_VERIFICATION_TOKEN ?? "dev-google-chat-verification";
const coreUrl = (process.env.CORE_URL ?? "http://localhost:3203").replace(/\/$/, "");
const internalToken = process.env.INTERNAL_SERVICE_TOKEN ?? "dev-internal-token";
const aiUrl = (process.env.AI_URL ?? "http://localhost:3205").replace(/\/$/, "");

export type GoogleChatEventInput = {
  eventId: string;
  verificationToken?: string;
  type?: string;
  action?: string;
  userId?: string;
  groupId?: string;
  taskCode?: string;
  askText?: string;
  /** Email fallback nếu có */
  fallbackEmail?: string;
};

/**
 * Phase 3: nhận event Google Chat (webhook hoặc internal).
 * Verify token + dedupe; COMPLETE_TASK / ASK_BOT; trả card.
 */
export async function handleGoogleChatEvent(input: GoogleChatEventInput) {
  if ((input.verificationToken ?? verificationToken) !== verificationToken) {
    // Cho phép bỏ token khi GOOGLE_CHAT_ALLOW_UNVERIFIED=true (chỉ local)
    if (process.env.GOOGLE_CHAT_ALLOW_UNVERIFIED !== "true") {
      throw new AppError("Token xác minh không hợp lệ", "UNAUTHORIZED", 401);
    }
  }

  const existing = await prismaRead.googleChatEventDedupe.findUnique({
    where: { eventId: input.eventId },
  });
  if (existing) {
    return {
      ok: true as const,
      deduped: true as const,
      googleChatResponse: buildTextCard("Đã xử lý", "Sự kiện trùng — bỏ qua."),
    };
  }

  await prismaWrite.googleChatEventDedupe.create({
    data: { eventId: input.eventId },
  });

  if (input.action === "COMPLETE_TASK") {
    if (!input.userId || !input.groupId || !input.taskCode) {
      throw new AppError("Lệnh hoàn thành việc thiếu userId/groupId/taskCode", "VALIDATION", 400);
    }
    try {
      await completeTaskViaCore({
        userId: input.userId,
        groupId: input.groupId,
        code: input.taskCode,
      });
    } catch (err) {
      if (input.fallbackEmail) {
        await sendChatEmailFallback({
          to: input.fallbackEmail,
          subject: `[Manage Teams] Không hoàn thành được ${input.taskCode}`,
          text: `Không hoàn thành được công việc ${input.taskCode} từ Google Chat. Mở app để thử lại.`,
        });
      }
      throw err;
    }
    logger.info(
      { eventId: input.eventId, groupId: input.groupId, code: input.taskCode },
      "google chat COMPLETE_TASK applied",
    );
    return {
      ok: true as const,
      deduped: false as const,
      card: {
        header: "Đã hoàn thành",
        text: `Công việc ${input.taskCode} đã đánh dấu hoàn thành (nguồn: chat).`,
      },
      googleChatResponse: buildTextCard(
        "Đã hoàn thành",
        `Công việc <b>${input.taskCode}</b> đã hoàn thành (nguồn: chat).`,
      ),
    };
  }

  if (input.action === "ASK_BOT" || (input.type === "MESSAGE" && input.askText)) {
    if (!input.userId || !input.askText) {
      throw new AppError("Lệnh hỏi bot thiếu userId/askText", "VALIDATION", 400);
    }
    const aiRes = await fetch(`${aiUrl}/internal/ai/bot-ask`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": internalToken,
      },
      body: JSON.stringify({ userId: input.userId, message: input.askText }),
    });
    const aiJson = (await aiRes.json().catch(() => ({}))) as {
      answer?: string;
      links?: Array<{ href: string; label: string }>;
    };
    const linkLines = (aiJson.links ?? [])
      .slice(0, 5)
      .map((l) => `- ${l.label}: ${l.href}`)
      .join("\n");
    const text = `${aiJson.answer ?? "Không có câu trả lời"}\n${linkLines}`.trim();
    return {
      ok: true as const,
      deduped: false as const,
      card: { header: "AI trả lời", text },
      googleChatResponse: buildTextCard("AI trả lời", text),
    };
  }

  return {
    ok: true as const,
    deduped: false as const,
    card: {
      header: "Manage Teams",
      text: "Bot sẵn sàng. /complete <code> hoặc bấm nút trên card.",
    },
    googleChatResponse: buildTextCard(
      "Manage Teams",
      "Bot sẵn sàng. Dùng <b>/complete CODE</b> hoặc nút trên card task.",
    ),
  };
}

async function completeTaskViaCore(input: {
  userId: string;
  groupId: string;
  code: string;
}): Promise<void> {
  const res = await fetch(`${coreUrl}/internal/tasks/complete`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": internalToken,
    },
    body: JSON.stringify({ ...input, source: "chat" }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new AppError(`Hoàn thành công việc thất bại: ${text}`, "CORE_ERROR", 502);
  }
}
