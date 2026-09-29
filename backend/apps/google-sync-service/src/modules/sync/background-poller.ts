import { prismaRead } from "@manage-teams/db";
import { createLogger } from "@manage-teams/lib";
import { enqueueTaskPull } from "./sync.service.js";

const logger = createLogger("google-sync-service");

/**
 * Poll nền theo lịch trên user_google_accounts.tasks_next_poll_at.
 * Chỉ user có refresh token + primary.
 * Luôn enqueue pull (kể cả khi chưa có assignee) để phát hiện task mới tạo trên Google.
 */
export function startBackgroundPoller(): () => void {
  const intervalMs = Number(process.env.GOOGLE_TASKS_BG_POLL_TICK_MS ?? 60_000);
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const now = new Date();
      const due = await prismaRead.userGoogleAccount.findMany({
        where: {
          isPrimary: true,
          refreshTokenEnc: { not: null },
          OR: [{ tasksNextPollAt: { lte: now } }, { tasksNextPollAt: null }],
        },
        take: 20,
        orderBy: { tasksNextPollAt: "asc" },
      });
      for (const acc of due) {
        const result = await enqueueTaskPull({ userId: acc.userId, force: false });
        if (!result.skipped) {
          logger.info({ userId: acc.userId, jobId: result.jobId }, "background pull enqueued");
        }
      }
    } catch (err) {
      logger.warn({ err }, "background poller tick failed");
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  logger.info({ intervalMs }, "background tasks poller started");

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
