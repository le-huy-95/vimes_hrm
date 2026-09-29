/**
 * Push job stub — claim PENDING/RETRY, log, mark SENT.
 * Chưa gọi FCM/APNs thật (Phase 1.7 deepen).
 */
import { prismaWrite } from "@manage-teams/db";
import { createLogger } from "@manage-teams/lib";

const logger = createLogger("worker-service");

export async function processPushJobs(limit = 20): Promise<{ processed: number; failed: number }> {
  const jobs = await prismaWrite.pushJob.findMany({
    where: { status: { in: ["PENDING", "RETRY"] } },
    orderBy: { createdAt: "asc" },
    take: Math.min(limit, 100),
  });

  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const tokens = await prismaWrite.deviceToken.findMany({
        where: { userId: job.userId },
        take: 20,
      });
      // Stub: chỉ log — chưa gửi FCM/APNs
      logger.info(
        {
          jobId: job.id,
          userId: job.userId,
          kind: job.kind,
          tokenCount: tokens.length,
          platforms: tokens.map((t) => t.platform),
          payload: job.payload,
        },
        "push stub delivered",
      );
      await prismaWrite.pushJob.update({
        where: { id: job.id },
        data: { status: "SENT", attempts: job.attempts + 1, lastError: null },
      });
      processed += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      await prismaWrite.pushJob.update({
        where: { id: job.id },
        data: {
          status: job.attempts + 1 >= 5 ? "FAILED" : "RETRY",
          attempts: job.attempts + 1,
          lastError: message.slice(0, 500),
        },
      });
      logger.warn({ jobId: job.id, err: message }, "push stub failed");
    }
  }

  return { processed, failed };
}
