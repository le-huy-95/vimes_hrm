import type { Request, Response } from "express";
import { createLogger, sendError, AppError } from "@manage-teams/lib";
import { z } from "zod";
import { handleGoogleChatEvent } from "./chat-events.service.js";
import { parseGoogleChatWebhook } from "./google-chat-format.js";

const logger = createLogger("google-sync-service");
const verificationToken =
  process.env.GOOGLE_CHAT_VERIFICATION_TOKEN ?? "dev-google-chat-verification";

const EventSchema = z.object({
  eventId: z.string().min(4).max(200),
  verificationToken: z.string().optional(),
  type: z.string().optional(),
  action: z.string().optional(),
  userId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  taskCode: z.string().optional(),
  askText: z.string().max(2000).optional(),
  fallbackEmail: z.string().email().optional(),
});

/** POST /internal/google-chat/events — shape nội bộ */
export async function receiveEvent(req: Request, res: Response): Promise<void> {
  try {
    const body = EventSchema.parse(req.body);
    res.json(await handleGoogleChatEvent(body));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/**
 * POST /google-chat/webhook — endpoint HTTP app (Google gọi).
 * Parse event Google + verification token header/body.
 */
export async function webhook(req: Request, res: Response): Promise<void> {
  try {
    const token =
      req.header("x-goog-channel-token") ??
      (typeof req.body?.token === "string" ? req.body.token : undefined) ??
      (typeof req.body?.verificationToken === "string" ? req.body.verificationToken : undefined);

    const parsed = parseGoogleChatWebhook(req.body);
    if (!parsed) {
      throw new AppError("Invalid Google Chat payload", "VALIDATION", 400);
    }

    // Map user từ email/name — production cần directory lookup; stub lấy từ parameters
    const result = await handleGoogleChatEvent({
      eventId: parsed.eventId,
      verificationToken: token ?? verificationToken,
      type: parsed.type,
      action: parsed.action,
      userId: parsed.userId,
      groupId: parsed.groupId,
      taskCode: parsed.taskCode,
      askText: parsed.askText,
    });

    // Google Chat kỳ vọng trả card trong body
    res.json(result.googleChatResponse ?? { text: result.card?.text ?? "ok" });
  } catch (err) {
    sendError(res, err, logger);
  }
}
