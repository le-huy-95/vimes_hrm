import type { RequestHandler } from "express";
import { AppError, createLogger, requireUser, sendError } from "@manage-teams/lib";

type Bucket = { count: number; resetAt: number };

const rateBuckets = new Map<string, Bucket>();
const tokenBuckets = new Map<string, number>();
const logger = createLogger("ai-rate-limit");

const WINDOW_MS = 60_000;

function dayKey(userId: string): string {
  const d = new Date().toISOString().slice(0, 10);
  return `budget:${userId}:${d}`;
}

export function resetAiRateLimitForTests(): void {
  rateBuckets.clear();
  tokenBuckets.clear();
}

export function addTokenUsage(userId: string, tokens: number): void {
  if (tokens <= 0) return;
  const key = dayKey(userId);
  tokenBuckets.set(key, (tokenBuckets.get(key) ?? 0) + tokens);
}

/** Returns AppError if over per-min or daily budget; null if ok. */
export function checkAiRateLimit(userId: string): AppError | null {
  const maxPerMin = Number(process.env.AI_RATE_LIMIT_PER_MIN ?? 10);
  const budget = Number(process.env.AI_TOKEN_BUDGET_PER_DAY ?? 200_000);

  const used = tokenBuckets.get(dayKey(userId)) ?? 0;
  if (used > budget) {
    return new AppError("Đã hết ngân sách token AI trong ngày.", "AI_BUDGET", 429);
  }

  const now = Date.now();
  const key = `rate:${userId}`;
  let b = rateBuckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    rateBuckets.set(key, b);
  }
  b.count += 1;
  if (b.count > maxPerMin) {
    return new AppError("Quá nhiều yêu cầu AI. Thử lại sau.", "RATE_LIMIT", 429);
  }
  return null;
}

/** Rate-limit POST /ai/chat and /ai/chat/stream. */
export function aiChatRateLimit(): RequestHandler {
  return (req, res, next) => {
    void (async () => {
      try {
        const user = await requireUser(req);
        const err = checkAiRateLimit(user.id);
        if (err) {
          sendError(res, err, logger);
          return;
        }
        next();
      } catch (e) {
        sendError(res, e, logger);
      }
    })();
  };
}
