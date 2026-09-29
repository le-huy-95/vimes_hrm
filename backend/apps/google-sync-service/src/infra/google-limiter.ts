/**
 * Limiter gọi Google API — in-memory, interface sẵn để đổi Redis sau.
 * Mục tiêu: tránh 429; tối đa N req/phút/user.
 */
export class GoogleLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly maxPerMin = Number(process.env.GOOGLE_TASKS_RATE_PER_MIN ?? 30),
  ) {}

  /** Chờ đến khi còn slot; trả false nếu quá lâu (không block vô hạn). */
  async acquire(userId: string, timeoutMs = 10_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const now = Date.now();
      let b = this.buckets.get(userId);
      if (!b || now >= b.resetAt) {
        b = { count: 0, resetAt: now + 60_000 };
        this.buckets.set(userId, b);
      }
      if (b.count < this.maxPerMin) {
        b.count += 1;
        return true;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  }
}

export const googleLimiter = new GoogleLimiter();
