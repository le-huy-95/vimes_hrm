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
): Promise<boolean> {
  const result = await redis.set(key, "1", "EX", ttlSeconds, "NX");
  return result === "OK";
}

export async function releaseLock(key: string): Promise<void> {
  await redis.del(key);
}

export async function isLocked(key: string): Promise<boolean> {
  return (await redis.exists(key)) === 1;
}
