import { conversationLastNKey } from "@manage-teams/cache-keys";
import { getRedis } from "./redis.js";

const LAST_N = Number(process.env.CHAT_LAST_N ?? 50);
const TTL_SEC = Number(process.env.CHAT_LAST_N_TTL_SEC ?? 300);

export type CachedMessage = {
  id: string;
  seq: number;
  clientMsgId: string | null;
  senderUserId: string;
  body: string;
  createdAt: string;
  replyToId?: string | null;
  fileIds?: string[];
  reactions?: Array<{ emoji: string; count: number; me: boolean }>;
  mentions?: string[];
  editedAt?: string | null;
  deleted?: boolean;
};

/** Đọc last-N từ Redis; miss → null (gọi DB). */
export async function getLastNCache(conversationId: string): Promise<CachedMessage[] | null> {
  const redis = await getRedis();
  if (!redis) return null;
  const raw = await redis.get(conversationLastNKey(conversationId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedMessage[];
  } catch {
    return null;
  }
}

/** Ghi last-N sau khi load từ DB (chỉ khi afterSeq=0). */
export async function setLastNCache(
  conversationId: string,
  messages: CachedMessage[],
): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  const sliced = messages.slice(-LAST_N);
  await redis.set(conversationLastNKey(conversationId), JSON.stringify(sliced), {
    EX: TTL_SEC,
  });
}

/** Invalidate last-N sau khi gửi/sửa/xoá tin — đọc lại sẽ hit DB. */
export async function invalidateLastNCache(conversationId: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  await redis.del(conversationLastNKey(conversationId));
}

export { LAST_N };
