import { google, type tasks_v1 } from "googleapis";
import { prismaRead, prismaWrite } from "@manage-teams/db";
import { createLogger } from "@manage-teams/lib";
import { googleLimiter } from "../../infra/google-limiter.js";
import {
  clearCachedAccessToken,
  getCachedAccessToken,
  setCachedAccessToken,
} from "../../infra/oauth-token-cache.js";
import { decryptSecret } from "../../infra/secret-box.js";
import {
  buildFieldHashes,
  diffPushFields,
  dueToGoogleRfc3339,
  parseStoredPayload,
  type TaskPushPayload,
} from "./sync-fields.js";
import { markJobAuthRequired, markJobDone, markJobRetry } from "./sync.service.js";

const logger = createLogger("google-sync-service");
const listTitle = process.env.GOOGLE_TASKS_LIST_TITLE ?? "Manage Teams";

/**
 * Xử lý 1 job TASKS_PUSH — tạo/cập nhật Google Task.
 * Debounce + CREATING lock + partial PATCH + token cache.
 */
export async function processTaskPushJob(job: {
  id: string;
  userId: string;
  aggregateId: string;
  payload: unknown;
  attempts: number;
}): Promise<void> {
  const ok = await googleLimiter.acquire(job.userId);
  if (!ok) {
    await markJobRetry(job.id, "rate_limit_wait", 5_000, job.attempts);
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
    const raw = job.payload as {
      title?: string;
      notes?: string;
      status?: string;
      due?: string | null;
    };
    const payload: TaskPushPayload = {
      title: raw.title ?? "",
      notes: raw.notes ?? "",
      status: raw.status ?? "TODO",
      due: raw.due === undefined ? null : raw.due,
    };

    // Anti-echo: không đẩy lại completion vừa kéo từ Google
    const assignee = await prismaRead.taskAssignee.findUnique({
      where: { taskId_userId: { taskId: job.aggregateId, userId: job.userId } },
    });
    if (assignee?.completedSource === "google" && payload.status === "DONE") {
      await markJobDone(job.id);
      logger.info({ jobId: job.id }, "TASKS_PUSH skipped — anti-echo google completion");
      return;
    }

    const listId = await ensureAppTaskList(tasksApi);

    const existing = await prismaRead.googleTaskLink.findUnique({
      where: { taskId_userId: { taskId: job.aggregateId, userId: job.userId } },
    });

    if (existing?.status === "CREATING") {
      // Job khác đang insert — retry sau
      await markJobRetry(job.id, "link_creating", 3_000, job.attempts);
      return;
    }

    if (existing && existing.status === "LINKED") {
      const prev = parseStoredPayload(existing.contentHash);
      const patch = diffPushFields(payload, prev);
      if (!patch) {
        await markJobDone(job.id);
        logger.info({ jobId: job.id }, "TASKS_PUSH skipped — content unchanged");
        return;
      }
      const requestBody: tasks_v1.Schema$Task = {};
      if (patch.title != null) requestBody.title = patch.title;
      if (patch.notes != null) requestBody.notes = patch.notes;
      if (patch.status != null) {
        requestBody.status = patch.status === "DONE" ? "completed" : "needsAction";
      }
      if (patch.due !== undefined) {
        requestBody.due = dueToGoogleRfc3339(patch.due) ?? null;
      }
      await tasksApi.tasks.patch({
        tasklist: listId,
        task: existing.googleTaskId,
        requestBody,
      });
      await prismaWrite.googleTaskLink.update({
        where: { id: existing.id },
        data: {
          contentHash: JSON.stringify(payload),
          fieldHashes: buildFieldHashes(payload),
          updatedAt: new Date(),
        },
      });
    } else {
      // CREATING lock chống trùng insert
      await prismaWrite.googleTaskLink.upsert({
        where: { taskId_userId: { taskId: job.aggregateId, userId: job.userId } },
        create: {
          taskId: job.aggregateId,
          userId: job.userId,
          googleTasklistId: listId,
          googleTaskId: `pending:${job.aggregateId}`,
          status: "CREATING",
        },
        update: {
          status: "CREATING",
          googleTasklistId: listId,
          updatedAt: new Date(),
        },
      });

      const created = await tasksApi.tasks.insert({
        tasklist: listId,
        requestBody: {
          title: payload.title,
          notes: payload.notes,
          status: payload.status === "DONE" ? "completed" : "needsAction",
          ...(payload.due
            ? { due: dueToGoogleRfc3339(payload.due) ?? undefined }
            : {}),
        },
      });
      if (!created.data.id) throw new Error("Google Tasks insert missing id");

      await prismaWrite.googleTaskLink.update({
        where: { taskId_userId: { taskId: job.aggregateId, userId: job.userId } },
        data: {
          googleTaskId: created.data.id,
          googleTasklistId: listId,
          etag: created.data.etag ?? null,
          status: "LINKED",
          contentHash: JSON.stringify(payload),
          fieldHashes: buildFieldHashes(payload),
          updatedAt: new Date(),
        },
      });
    }

    await markJobDone(job.id);
    logger.info({ jobId: job.id, taskId: job.aggregateId }, "TASKS_PUSH done");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("invalid_grant")) {
      clearCachedAccessToken(job.userId);
      await markJobAuthRequired(job.id, msg);
      await prismaWrite.googleTaskLink.updateMany({
        where: { userId: job.userId, status: { in: ["LINKED", "CREATING"] } },
        data: { status: "AUTH_REQUIRED", updatedAt: new Date() },
      });
      return;
    }
    // Rollback CREATING nếu insert fail
    await prismaWrite.googleTaskLink.updateMany({
      where: {
        taskId: job.aggregateId,
        userId: job.userId,
        status: "CREATING",
      },
      data: { status: "DETACHED", updatedAt: new Date() },
    });
    const backoff = Math.min(60_000 * Math.max(1, job.attempts), 15 * 60_000);
    await markJobRetry(job.id, msg, backoff, job.attempts);
    logger.warn({ err, jobId: job.id }, "TASKS_PUSH failed — retry");
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

async function ensureAppTaskList(
  tasksApi: ReturnType<typeof google.tasks>,
): Promise<string> {
  const listed = await tasksApi.tasklists.list({ maxResults: 100 });
  const found = listed.data.items?.find((i) => i.title === listTitle);
  if (found?.id) return found.id;
  const created = await tasksApi.tasklists.insert({ requestBody: { title: listTitle } });
  if (!created.data.id) throw new Error("Failed to create task list");
  return created.data.id;
}
