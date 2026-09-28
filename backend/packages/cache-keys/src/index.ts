/** App-owned Redis key helpers (v2.5 §4). Socket.IO adapter keys are separate. */

export const CACHE_PREFIX = "cache:" as const;
export const RT_PREFIX = "rt:" as const;

export function groupMembershipKey(groupId: string): string {
  return `${CACHE_PREFIX}group:${groupId}:members`;
}

export function groupTaskListKey(groupId: string, filterHash = "default"): string {
  return `${CACHE_PREFIX}group:${groupId}:tasks:${filterHash}`;
}

export function taskDetailKey(taskId: string, version: number | string): string {
  return `${CACHE_PREFIX}task:${taskId}:v${version}`;
}

export function conversationLastNKey(conversationId: string): string {
  return `${CACHE_PREFIX}conv:${conversationId}:lastn`;
}

export function fileMetadataKey(fileId: string): string {
  return `${CACHE_PREFIX}file:${fileId}:meta`;
}

export function presenceKey(userId: string): string {
  return `${RT_PREFIX}presence:${userId}`;
}

export function typingKey(conversationId: string, userId: string): string {
  return `${RT_PREFIX}typing:${conversationId}:${userId}`;
}
