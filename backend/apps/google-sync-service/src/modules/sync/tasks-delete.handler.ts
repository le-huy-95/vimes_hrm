import { google } from "googleapis";
import { prismaRead, prismaWrite } from "@manage-teams/db";
import { createLogger } from "@manage-teams/lib";
import { googleLimiter } from "../../infra/google-limiter.js";
import {
  clearCachedAccessToken,
  getCachedAccessToken,
  setCachedAccessToken,
} from "../../infra/oauth-token-cache.js";
import { decryptSecret } from "../../infra/secret-box.js";
import { markJobAuthRequired, markJobDone, markJobRetry } from "./sync.service.js";

const logger = createLogger("google-sync-service");

/** Xóa task trên Google Tasks theo link của user; cập nhật DETACHED. */
export async function processTaskDeleteJob(job: {
  id: string;
  userId: string;
  aggregateId: string;
  attempts: number;
}): Promise<void> {
  const ok = await googleLimiter.acquire(job.userId);
  if (!ok) {
    await markJobRetry(job.id, "rate_limit_wait", 5_000, job.attempts);
    return;
  }

  const link = await prismaRead.googleTaskLink.findUnique({
    where: { taskId_userId: { taskId: job.aggregateId, userId: job.userId } },
  });
  if (!link || link.status === "DETACHED") {
    await markJobDone(job.id);
    return;
  }
  if (link.status === "CREATING" || link.googleTaskId.startsWith("pending:")) {
    await prismaWrite.googleTaskLink.update({
      where: { id: link.id },
      data: { status: "DETACHED", updatedAt: new Date() },
    });
    await markJobDone(job.id);
    return;
  }

  const account = await prismaRead.userGoogleAccount.findFirst({
    where: { userId: job.userId, isPrimary: true },
  });
  if (!account?.refreshTokenEnc) {
    await markJobAuthRequired(job.id, "User chưa liên kết Google hoặc thiếu refresh token");
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    await markJobRetry(job.id, "GOOGLE_CLIENT_ID/SECRET chưa cấu hình", 60_000, job.attempts);
    return;
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(account.refreshTokenEnc);
  } catch {
    await markJobAuthRequired(job.id, "Không giải mã được Google refresh token");
    return;
  }

  try {
    const tasksApi = await getTasksClient(job.userId, clientId, clientSecret, refreshToken);
    try {
      await tasksApi.tasks.delete({
        tasklist: link.googleTasklistId,
        task: link.googleTaskId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Task đã xóa trên Google — coi như thành công.
      if (!msg.includes("404") && !msg.toLowerCase().includes("not found")) {
        throw err;
      }
      logger.info({ taskId: job.aggregateId, userId: job.userId }, "Google task already gone");
    }

    await prismaWrite.googleTaskLink.update({
      where: { id: link.id },
      data: { status: "DETACHED", updatedAt: new Date() },
    });
    await markJobDone(job.id);
    logger.info({ jobId: job.id, taskId: job.aggregateId }, "TASKS_DELETE done");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("invalid_grant")) {
      clearCachedAccessToken(job.userId);
      await markJobAuthRequired(job.id, msg);
      return;
    }
    const backoff = Math.min(60_000 * Math.max(1, job.attempts), 15 * 60_000);
    await markJobRetry(job.id, msg, backoff, job.attempts);
    logger.warn({ err, jobId: job.id }, "TASKS_DELETE failed — retry");
  }
}

async function getTasksClient(
  userId: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
) {
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  const cached = getCachedAccessToken(userId);
  if (cached) {
    oauth2.setCredentials({ access_token: cached, refresh_token: refreshToken });
  } else {
    oauth2.setCredentials({ refresh_token: refreshToken });
    const tok = await oauth2.getAccessToken();
    if (tok.token) setCachedAccessToken(userId, tok.token);
  }
  return google.tasks({ version: "v1", auth: oauth2 });
}
