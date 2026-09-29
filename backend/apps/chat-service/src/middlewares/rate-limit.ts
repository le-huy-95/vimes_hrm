import type { RequestHandler } from "express";
import { AppError } from "@manage-teams/lib";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const MAX_PER_MIN = Number(process.env.CHAT_RATE_LIMIT_PER_MIN ?? 60);
const MAX_REACTION_PER_MIN = Number(process.env.CHAT_REACTION_RATE_LIMIT_PER_MIN ?? 120);

function rateLimitKey(req: Parameters<RequestHandler>[0], prefix: string): string {
  const id =
    (req as { userId?: string }).userId ??
    req.header("authorization")?.slice(0, 24) ??
    req.ip ??
    "anon";
  return `${prefix}:${id}`;
}

function checkBucket(key: string, max: number): AppError | null {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > max) {
    return new AppError("Quá nhiều yêu cầu. Thử lại sau.", "RATE_LIMIT", 429);
  }
  return null;
}

/**
 * Rate-limit gửi tin theo userId (hoặc IP).
 * Vượt ngưỡng → 429 RATE_LIMIT.
 */
export function chatSendRateLimit(): RequestHandler {
  return (req, _res, next) => {
    const err = checkBucket(rateLimitKey(req, "send"), MAX_PER_MIN);
    if (err) {
      next(err);
      return;
    }
    next();
  };
}

/** Rate-limit toggle reaction (Phase 1.7). */
export function chatReactionRateLimit(): RequestHandler {
  return (req, _res, next) => {
    const err = checkBucket(rateLimitKey(req, "reaction"), MAX_REACTION_PER_MIN);
    if (err) {
      next(err);
      return;
    }
    next();
  };
}
