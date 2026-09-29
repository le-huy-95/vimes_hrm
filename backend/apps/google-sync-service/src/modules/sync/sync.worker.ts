import { createLogger } from "@manage-teams/lib";
import { claimNextJobs, markJobDone } from "./sync.service.js";
import { processTaskPushJob } from "./tasks-push.handler.js";
import { processTaskDeleteJob } from "./tasks-delete.handler.js";
import { processTaskPullJob } from "./tasks-pull.handler.js";
import { processSheetsPushJob, processSheetsPullJob } from "./sheets.handler.js";
import { reconcileStaleLinks } from "./reconcile.service.js";

const logger = createLogger("google-sync-service");
const intervalMs = Number(process.env.SYNC_WORKER_INTERVAL_MS ?? 3000);
const reconcileEveryMs = Number(process.env.GOOGLE_TASKS_RECONCILE_MS ?? 15 * 60_000);

/** Poll sync_jobs định kỳ — trả hàm stop. */
export function startSyncWorker(): () => void {
  let stopped = false;
  let lastReconcile = 0;

  const tick = async () => {
    if (stopped) return;
    try {
      const jobs = await claimNextJobs(5);
      for (const job of jobs) {
        const base = {
          id: job.id,
          userId: job.userId,
          aggregateId: job.aggregateId,
          payload: job.payload,
          attempts: job.attempts,
        };
        if (job.jobType === "TASKS_PUSH") {
          await processTaskPushJob(base);
        } else if (job.jobType === "TASKS_DELETE") {
          await processTaskDeleteJob(base);
        } else if (job.jobType === "TASKS_PULL") {
          await processTaskPullJob(base);
        } else if (job.jobType === "SHEETS_PUSH") {
          await processSheetsPushJob(base);
        } else if (job.jobType === "SHEETS_PULL") {
          await processSheetsPullJob(base);
        } else {
          logger.warn({ jobType: job.jobType }, "unknown job type — mark done");
          await markJobDone(job.id);
        }
      }

      if (reconcileEveryMs > 0 && Date.now() - lastReconcile >= reconcileEveryMs) {
        lastReconcile = Date.now();
        await reconcileStaleLinks(30).catch((err) =>
          logger.warn({ err }, "reconcile tick failed"),
        );
      }
    } catch (err) {
      logger.error({ err }, "sync worker tick failed");
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  logger.info({ intervalMs, reconcileEveryMs }, "sync worker started");

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
