import { createClient, type RedisClientType } from "redis";
import { createLogger } from "@manage-teams/lib";

const logger = createLogger("chat-service");
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:16379";

let client: RedisClientType | null = null;

/** Lấy Redis client dùng chung (cache last-N + presence). Fail → null. */
export async function getRedis(): Promise<RedisClientType | null> {
  if (client?.isOpen) return client;
  try {
    client = createClient({ url: redisUrl }) as RedisClientType;
    client.on("error", (err) => logger.warn({ err }, "redis client error"));
    await client.connect();
    return client;
  } catch (err) {
    logger.warn({ err }, "redis unavailable");
    client = null;
    return null;
  }
}
