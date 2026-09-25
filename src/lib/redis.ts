import { randomBytes } from "node:crypto";
import { Redis } from "ioredis";
import { env } from "./env.js";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

export async function acquireLock(
  key: string,
  ttlSeconds: number,
): Promise<string | null> {
  const token = randomBytes(16).toString("hex");
  const result = await redis.set(key, token, "EX", ttlSeconds, "NX");
  return result === "OK" ? token : null;
}

export async function releaseLock(
  key: string,
  token: string,
): Promise<void> {
  await redis.eval(
    `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
    1,
    key,
    token,
  );
}

// Observability helper only — racy by nature, do not use for gating.
export async function isLocked(key: string): Promise<boolean> {
  return (await redis.exists(key)) === 1;
}
