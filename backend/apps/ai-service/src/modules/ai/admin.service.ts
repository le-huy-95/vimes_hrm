import { prismaRead } from "@manage-teams/db";
import { AppError } from "@manage-teams/lib";

function adminAllowlist(): Set<string> {
  return new Set(
    (process.env.PLATFORM_ADMIN_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function assertPlatformAdmin(userId: string): void {
  const allow = adminAllowlist();
  if (allow.size === 0) {
    // Dev: empty allowlist = mọi authenticated user (stub). Prod: set env.
    if (process.env.NODE_ENV === "production") {
      throw new AppError("Không có quyền", "FORBIDDEN", 403);
    }
    return;
  }
  if (!allow.has(userId)) throw new AppError("Không có quyền", "FORBIDDEN", 403);
}

/** Phase 6d: snapshot vận hành chỉ đọc. */
export async function getOpsSnapshot() {
  const [syncPending, syncAuth, syncRetry, aiSessions24h] = await Promise.all([
    prismaRead.syncJob.count({ where: { status: { in: ["PENDING", "RUNNING"] } } }),
    prismaRead.syncJob.count({ where: { status: "AUTH_REQUIRED" } }),
    prismaRead.syncJob.count({ where: { status: "RETRY" } }),
    prismaRead.aiSession.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ]);

  return {
    serviceHealth: {
      ai: "ok",
      note: "Gateway /metrics for process metrics",
    },
    syncBacklog: {
      pendingOrRunning: syncPending,
      authRequired: syncAuth,
      retry: syncRetry,
    },
    dlqSummary: {
      stub: true,
      message: "Sẽ gắn metrics Kafka DLQ sau — worker /internal/dlq/replay đã có",
    },
    aiUsage: {
      sessionsLast24h: aiSessions24h,
    },
  };
}
