/**
 * Cache access token OAuth2 theo user — giảm refresh mỗi job.
 * Interface giữ in-memory; có thể đổi Redis khi multi-replica.
 */
type Entry = { accessToken: string; expiresAt: number };

const cache = new Map<string, Entry>();

/** Lấy access token còn hạn; null nếu miss/hết hạn. */
export function getCachedAccessToken(userId: string): string | null {
  const e = cache.get(userId);
  if (!e) return null;
  if (Date.now() >= e.expiresAt - 30_000) {
    cache.delete(userId);
    return null;
  }
  return e.accessToken;
}

/** Lưu access token (expiresIn giây từ Google). */
export function setCachedAccessToken(userId: string, accessToken: string, expiresInSec = 3500): void {
  cache.set(userId, {
    accessToken,
    expiresAt: Date.now() + expiresInSec * 1000,
  });
}

/** Xoá khi invalid_grant / AUTH_REQUIRED. */
export function clearCachedAccessToken(userId: string): void {
  cache.delete(userId);
}
