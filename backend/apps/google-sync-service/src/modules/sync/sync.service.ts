import { createHash } from "node:crypto";
import { prismaRead, prismaWrite } from "@manage-teams/db";
import { createLogger } from "@manage-teams/lib";
import { composePushNotes } from "./notes-split.js";

const logger = createLogger("google-sync-service");
const DEBOUNCE_MS = Number(process.env.GOOGLE_TASKS_PUSH_DEBOUNCE_MS ?? 10_000);
const MAX_ATTEMPTS = Number(process.env.GOOGLE_SYNC_MAX_ATTEMPTS ?? 8);

/** Hash nội dung để bỏ job nếu không đổi. */
export function contentHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export type EnqueueTaskPushInput = {
  userId: string;
  taskId: string;
  title: string;
  notes?: string;
  status?: string;
  /** YYYY-MM-DD hoặc null để xóa hạn. */
  due?: string | null;
};

export type EnqueueTaskPullInput = {
  userId: string;
  /** force=true bỏ cooldown (nút làm mới). */
  force?: boolean;
  /** Group ưu tiên khi import task tạo trên Google. */
  preferredGroupId?: string;
};

/**
 * Enqueue đẩy task lên Google Tasks (một chiều).
 * Dedup + debounce 5–30s (mặc định 10s).
 */
export async function enqueueTaskPush(input: EnqueueTaskPushInput) {
  const notes = composePushNotes(input.taskId, input.notes);
  const due = input.due === undefined ? undefined : input.due;
  const hash = contentHash({
    title: input.title,
    notes,
    status: input.status ?? "TODO",
    due: due ?? null,
  });
  const nextRunAt = new Date(Date.now() + DEBOUNCE_MS);

  const payload = {
    title: input.title,
    notes,
    status: input.status ?? "TODO",
    ...(due !== undefined ? { due } : {}),
  };

  const existing = await prismaWrite.syncJob.findFirst({
    where: {
      userId: input.userId,
      jobType: "TASKS_PUSH",
      aggregateId: input.taskId,
      status: { in: ["PENDING", "RETRY", "RUNNING"] },
    },
  });

  if (existing) {
    if (existing.contentHash === hash) {
      return { jobId: existing.id, deduped: true };
    }
    const updated = await prismaWrite.syncJob.update({
      where: { id: existing.id },
      data: {
        payload,
        contentHash: hash,
        nextRunAt: existing.nextRunAt > new Date() ? existing.nextRunAt : nextRunAt,
        updatedAt: new Date(),
      },
    });
    return { jobId: updated.id, deduped: false, updated: true };
  }

  const job = await prismaWrite.syncJob.create({
    data: {
      userId: input.userId,
      jobType: "TASKS_PUSH",
      aggregateType: "task",
      aggregateId: input.taskId,
      payload,
      contentHash: hash,
      status: "PENDING",
      nextRunAt,
    },
  });
  return { jobId: job.id, deduped: false };
}

export type EnqueueTaskDeleteInput = {
  userId: string;
  taskId: string;
};

/** Hủy push đang chờ khi task bị xóa trên app. */
async function cancelPendingTaskPushes(taskId: string, userId?: string): Promise<void> {
  await prismaWrite.syncJob.updateMany({
    where: {
      aggregateId: taskId,
      jobType: "TASKS_PUSH",
      status: { in: ["PENDING", "RETRY"] },
      ...(userId ? { userId } : {}),
    },
    data: {
      status: "DONE",
      lastError: "cancelled_task_deleted",
      updatedAt: new Date(),
    },
  });
}

/** Enqueue xóa task trên Google Tasks (một user / một link). */
export async function enqueueTaskDelete(input: EnqueueTaskDeleteInput) {
  await cancelPendingTaskPushes(input.taskId, input.userId);

  const existing = await prismaWrite.syncJob.findFirst({
    where: {
      userId: input.userId,
      jobType: "TASKS_DELETE",
      aggregateId: input.taskId,
      status: { in: ["PENDING", "RETRY", "RUNNING"] },
    },
  });
  if (existing) {
    return { jobId: existing.id, deduped: true as const };
  }

  const job = await prismaWrite.syncJob.create({
    data: {
      userId: input.userId,
      jobType: "TASKS_DELETE",
      aggregateType: "task",
      aggregateId: input.taskId,
      payload: { op: "delete" },
      status: "PENDING",
      nextRunAt: new Date(),
    },
  });
  return { jobId: job.id, deduped: false as const };
}

/** Sau khi app xóa task — enqueue delete cho mọi Google link còn LINKED/CREATING. */
export async function enqueueTaskDeletesForAppTask(taskId: string) {
  await cancelPendingTaskPushes(taskId);
  const links = await prismaRead.googleTaskLink.findMany({
    where: {
      taskId,
      status: { in: ["LINKED", "CREATING"] },
    },
    select: { userId: true },
  });
  let enqueued = 0;
  for (const link of links) {
    const r = await enqueueTaskDelete({ userId: link.userId, taskId });
    if (!r.deduped) enqueued += 1;
  }
  return { enqueued, links: links.length };
}

/**
 * Enqueue kéo delta Google Tasks (Phase 2.5).
 * Cooldown mặc định 5 phút trừ khi force.
 */
export async function enqueueTaskPull(input: EnqueueTaskPullInput) {
  // Cooldown mặc định 3 phút — tiết kiệm quota Google Tasks (force=true bỏ qua).
  const cooldownMs = Number(process.env.GOOGLE_TASKS_PULL_COOLDOWN_MS ?? 3 * 60_000);
  if (!input.force) {
    const account = await prismaWrite.userGoogleAccount.findFirst({
      where: { userId: input.userId, isPrimary: true },
    });
    if (account?.tasksLastPullAt) {
      const elapsed = Date.now() - account.tasksLastPullAt.getTime();
      if (elapsed < cooldownMs) {
        return { jobId: null as string | null, skipped: true as const, reason: "cooldown" };
      }
    }
  }

  const existing = await prismaWrite.syncJob.findFirst({
    where: {
      userId: input.userId,
      jobType: "TASKS_PULL",
      aggregateId: input.userId,
      status: { in: ["PENDING", "RETRY", "RUNNING"] },
    },
  });
  if (existing) {
    if (input.preferredGroupId) {
      const prev = (existing.payload ?? {}) as Record<string, unknown>;
      await prismaWrite.syncJob.update({
        where: { id: existing.id },
        data: {
          payload: { ...prev, preferredGroupId: input.preferredGroupId, force: Boolean(input.force) },
          updatedAt: new Date(),
        },
      });
    }
    return { jobId: existing.id, deduped: true as const, skipped: false as const };
  }

  const job = await prismaWrite.syncJob.create({
    data: {
      userId: input.userId,
      jobType: "TASKS_PULL",
      aggregateType: "user",
      aggregateId: input.userId,
      payload: {
        force: Boolean(input.force),
        ...(input.preferredGroupId ? { preferredGroupId: input.preferredGroupId } : {}),
      },
      status: "PENDING",
    },
  });
  logger.info({ jobId: job.id, userId: input.userId }, "TASKS_PULL enqueued");
  return { jobId: job.id, deduped: false as const, skipped: false as const };
}

/** Đồng bộ đầy đủ: push task mở + pull force. */
export async function enqueueFullSync(userId: string) {
  const assignees = await prismaRead.taskAssignee.findMany({
    where: { userId, status: "ACTIVE" },
    include: { task: true },
    take: 200,
  });
  let pushCount = 0;
  for (const a of assignees) {
    if (a.task.deletedAt || a.task.status === "DONE") continue;
    await enqueueTaskPush({
      userId,
      taskId: a.taskId,
      title: a.task.title,
      notes: a.personalNote ?? "",
      status: a.task.status,
    });
    pushCount += 1;
  }
  const pull = await enqueueTaskPull({ userId, force: true });
  return { pushCount, pull };
}

export type EnqueueSheetsInput = {
  userId: string;
  groupId: string;
  direction: "PUSH" | "PULL";
  payload?: unknown;
};

/** Enqueue Sheets sync stub (Phase 4). */
export async function enqueueSheetsJob(input: EnqueueSheetsInput) {
  const jobType = input.direction === "PUSH" ? "SHEETS_PUSH" : "SHEETS_PULL";
  const existing = await prismaWrite.syncJob.findFirst({
    where: {
      userId: input.userId,
      jobType,
      aggregateId: input.groupId,
      status: { in: ["PENDING", "RETRY", "RUNNING"] },
    },
  });
  if (existing) return { jobId: existing.id, deduped: true as const };

  const job = await prismaWrite.syncJob.create({
    data: {
      userId: input.userId,
      jobType,
      aggregateType: "group",
      aggregateId: input.groupId,
      payload: (input.payload ?? {}) as object,
      status: "PENDING",
    },
  });
  logger.info({ jobId: job.id, jobType, groupId: input.groupId }, "sheets job enqueued");
  return { jobId: job.id, deduped: false as const };
}

/** Lấy job đến hạn để chạy. */
export async function claimNextJobs(limit = 10) {
  const now = new Date();
  const jobs = await prismaWrite.syncJob.findMany({
    where: {
      status: { in: ["PENDING", "RETRY"] },
      nextRunAt: { lte: now },
    },
    orderBy: { nextRunAt: "asc" },
    take: limit,
  });

  const claimed = [];
  for (const job of jobs) {
    const updated = await prismaWrite.syncJob.updateMany({
      where: { id: job.id, status: { in: ["PENDING", "RETRY"] } },
      data: { status: "RUNNING", attempts: { increment: 1 }, updatedAt: now },
    });
    if (updated.count === 1) claimed.push({ ...job, attempts: job.attempts + 1 });
  }
  return claimed;
}

export async function markJobDone(jobId: string) {
  await prismaWrite.syncJob.update({
    where: { id: jobId },
    data: { status: "DONE", lastError: null, updatedAt: new Date() },
  });
}

export async function markJobRetry(jobId: string, error: string, backoffMs: number, attempts?: number) {
  const job = attempts == null
    ? await prismaRead.syncJob.findUnique({ where: { id: jobId } })
    : { attempts };
  const n = job?.attempts ?? 0;
  if (n >= MAX_ATTEMPTS) {
    await markJobFailed(jobId, `DLQ after ${n} attempts: ${error}`);
    return;
  }
  await prismaWrite.syncJob.update({
    where: { id: jobId },
    data: {
      status: "RETRY",
      lastError: error.slice(0, 2000),
      nextRunAt: new Date(Date.now() + backoffMs),
      updatedAt: new Date(),
    },
  });
}

/** DLQ nhẹ: status FAILED, không retry thêm. */
export async function markJobFailed(jobId: string, error: string) {
  await prismaWrite.syncJob.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      lastError: error.slice(0, 2000),
      updatedAt: new Date(),
    },
  });
  logger.warn({ jobId, error: error.slice(0, 200) }, "sync job FAILED (DLQ)");
}

export async function markJobAuthRequired(jobId: string, error: string) {
  await prismaWrite.syncJob.update({
    where: { id: jobId },
    data: {
      status: "AUTH_REQUIRED",
      lastError: error.slice(0, 2000),
      updatedAt: new Date(),
    },
  });
}

/** Trạng thái sync của user (Phase 2 deepen). */
export async function getSyncStatus(userId: string) {
  const account = await prismaRead.userGoogleAccount.findFirst({
    where: { userId, isPrimary: true },
  });
  const [pending, retry, failed, authRequired, links] = await Promise.all([
    prismaRead.syncJob.count({ where: { userId, status: "PENDING" } }),
    prismaRead.syncJob.count({ where: { userId, status: "RETRY" } }),
    prismaRead.syncJob.count({ where: { userId, status: "FAILED" } }),
    prismaRead.syncJob.count({ where: { userId, status: "AUTH_REQUIRED" } }),
    prismaRead.googleTaskLink.count({ where: { userId, status: "LINKED" } }),
  ]);
  const recent = await prismaRead.syncJob.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: {
      id: true,
      jobType: true,
      status: true,
      attempts: true,
      lastError: true,
      nextRunAt: true,
      updatedAt: true,
      aggregateId: true,
    },
  });
  return {
    googleLinked: Boolean(account?.refreshTokenEnc),
    tasksLastPullAt: account?.tasksLastPullAt ?? null,
    tasksSyncCursor: account?.tasksSyncCursor ?? null,
    tasksPollIntervalS: account?.tasksPollIntervalS ?? null,
    tasksNextPollAt: account?.tasksNextPollAt ?? null,
    backlog: { pending, retry, failed, authRequired },
    linkedTasks: links,
    recentJobs: recent,
  };
}
