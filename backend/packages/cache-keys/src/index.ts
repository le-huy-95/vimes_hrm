/** Helper tên key Redis (v2.5) — cache:* có TTL; rt:* presence/typing. */

export const CACHE_PREFIX = "cache:" as const;
export const RT_PREFIX = "rt:" as const;

/** Key danh sách thành viên group. */
export function groupMembershipKey(groupId: string): string {
  return `${CACHE_PREFIX}group:${groupId}:members`;
}

/** Key list task theo group + filter. */
export function groupTaskListKey(groupId: string, filterHash = "default"): string {
  return `${CACHE_PREFIX}group:${groupId}:tasks:${filterHash}`;
}

/** Key chi tiết task theo version. */
export function taskDetailKey(taskId: string, version: number | string): string {
  return `${CACHE_PREFIX}task:${taskId}:v${version}`;
}

/** Key last-N tin nhắn conversation. */
export function conversationLastNKey(conversationId: string): string {
  return `${CACHE_PREFIX}conv:${conversationId}:lastn`;
}

/** Key metadata file. */
export function fileMetadataKey(fileId: string): string {
  return `${CACHE_PREFIX}file:${fileId}:meta`;
}

/** Key presence realtime (online). */
export function presenceKey(userId: string): string {
  return `${RT_PREFIX}presence:${userId}`;
}

/** Key typing indicator. */
export function typingKey(conversationId: string, userId: string): string {
  return `${RT_PREFIX}typing:${conversationId}:${userId}`;
}
