import { CACHE_PREFIX, groupTaskListKey, taskDetailKey } from "@manage-teams/cache-keys";
import { getRedis } from "./redis.js";

const LIST_TTL_SEC = Number(process.env.GROUP_TASK_LIST_TTL_SEC ?? 120);
const DETAIL_TTL_SEC = Number(process.env.TASK_DETAIL_TTL_SEC ?? 300);

const DEFAULT_LIST_FILTER = "default";

export type CachedTaskListItem = {
  id: string;
  code: string;
  title: string;
  status: string;
  completionMode: string;
  maxAssignees: number | null;
  allowClaim: boolean;
  createdAt: Date;
  dueDate: string | null;
  description: string | null;
  parentId: string | null;
  parentCode: string | null;
  starred: boolean;
  assignees: Array<{
    userId: string;
    status: string;
    email: string;
    displayName: string | null;
  }>;
};

export type CachedTaskDetail = Record<string, unknown>;

export async function getTaskListCache(groupId: string): Promise<CachedTaskListItem[] | null> {
  const redis = await getRedis();
  if (!redis) return null;
  const raw = await redis.get(groupTaskListKey(groupId, DEFAULT_LIST_FILTER));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedTaskListItem[];
    return parsed.map((t) => ({
      ...t,
      createdAt: new Date(t.createdAt),
    }));
  } catch {
    return null;
  }
}

export async function setTaskListCache(groupId: string, tasks: CachedTaskListItem[]): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  await redis.set(
    groupTaskListKey(groupId, DEFAULT_LIST_FILTER),
    JSON.stringify(
      tasks.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
      })),
    ),
    { EX: LIST_TTL_SEC },
  );
}

export async function invalidateTaskListCache(groupId: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  await redis.del(groupTaskListKey(groupId, DEFAULT_LIST_FILTER));
}

export async function getTaskDetailCache(
  taskId: string,
  version: number,
): Promise<CachedTaskDetail | null> {
  const redis = await getRedis();
  if (!redis) return null;
  const raw = await redis.get(taskDetailKey(taskId, version));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedTaskDetail;
  } catch {
    return null;
  }
}

export async function setTaskDetailCache(
  taskId: string,
  version: number,
  detail: CachedTaskDetail,
): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  await redis.set(taskDetailKey(taskId, version), JSON.stringify(detail), { EX: DETAIL_TTL_SEC });
}

/** Xóa mọi bản cache chi tiết task (mọi version). */
export async function invalidateTaskDetailCache(taskId: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  const pattern = `${CACHE_PREFIX}task:${taskId}:v*`;
  let cursor = 0;
  do {
    const reply = await redis.scan(cursor, { MATCH: pattern, COUNT: 50 });
    cursor = reply.cursor;
    if (reply.keys.length > 0) {
      await redis.del(reply.keys);
    }
  } while (cursor !== 0);
}

export async function invalidateGroupTaskCaches(groupId: string, taskId: string): Promise<void> {
  await invalidateTaskListCache(groupId);
  await invalidateTaskDetailCache(taskId);
}
