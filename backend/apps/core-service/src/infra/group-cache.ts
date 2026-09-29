import { groupMembershipKey } from "@manage-teams/cache-keys";
import { getRedis } from "./redis.js";

const TTL_SEC = Number(process.env.GROUP_MEMBERSHIP_TTL_SEC ?? 300);

export type CachedGroupDetail = {
  id: string;
  organizationId: string;
  name: string;
  settings: unknown;
  members: Array<{
    userId: string;
    role: string;
    email: string;
    displayName: string | null;
  }>;
};

export async function getGroupDetailCache(groupId: string): Promise<CachedGroupDetail | null> {
  const redis = await getRedis();
  if (!redis) return null;
  const raw = await redis.get(groupMembershipKey(groupId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedGroupDetail;
  } catch {
    return null;
  }
}

export async function setGroupDetailCache(groupId: string, detail: CachedGroupDetail): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  await redis.set(groupMembershipKey(groupId), JSON.stringify(detail), { EX: TTL_SEC });
}

export async function invalidateGroupDetailCache(groupId: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  await redis.del(groupMembershipKey(groupId));
}
