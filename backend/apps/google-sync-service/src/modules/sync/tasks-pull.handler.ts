import { google, type tasks_v1 } from "googleapis";
import { prismaRead, prismaWrite, type Prisma } from "@manage-teams/db";
import { createLogger } from "@manage-teams/lib";
import { googleLimiter } from "../../infra/google-limiter.js";
import {
  clearCachedAccessToken,
  getCachedAccessToken,
  setCachedAccessToken,
} from "../../infra/oauth-token-cache.js";
import { decryptSecret } from "../../infra/secret-box.js";
import { buildFieldHashes, formatDbDue, googleDueToDateOnly, localWinsConflict } from "./sync-fields.js";
import {
  composePushNotes,
  shouldApplyGoogleCompletion,
  shouldApplyGoogleUncomplete,
  splitGoogleNotes,
} from "./notes-split.js";
import { emitGoogleSignals, type GoogleSignal } from "./signals.service.js";
import {
  enqueueTaskDeletesForAppTask,
  enqueueTaskPush,
  markJobAuthRequired,
  markJobDone,
  markJobRetry,
} from "./sync.service.js";

const logger = createLogger("google-sync-service");
const listTitle = process.env.GOOGLE_TASKS_LIST_TITLE ?? "Manage Teams";
/** Overlap vài chục giây để không miss biên updatedMin. */
const OVERLAP_MS = Number(process.env.GOOGLE_TASKS_PULL_OVERLAP_MS ?? 45_000);
/** Poll gần realtime vừa phải: mặc định 3 phút (tránh đốt quota Google). */
const POLL_MIN_S = Number(process.env.GOOGLE_TASKS_POLL_MIN_S ?? 180);
const POLL_MAX_S = Number(process.env.GOOGLE_TASKS_POLL_MAX_S ?? 1800);
/** Import task tạo trên Google (không có [app:uuid]) vào group của user. */
const IMPORT_NATIVE = (process.env.GOOGLE_TASKS_IMPORT_NATIVE ?? "true") !== "false";

/**
 * Phase 2.5: kéo thay đổi Google Tasks (updatedMin) → merge completion / title / DETACHED.
 * Import task native từ Google → tạo Task + assignee + link trong group ưu tiên.
 * Lần đầu (không cursor): backfill đẩy task ACTIVE thiếu link.
 */
export async function processTaskPullJob(job: {
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

  const preferredGroupId =
    typeof (job.payload as { preferredGroupId?: unknown })?.preferredGroupId === "string"
      ? ((job.payload as { preferredGroupId: string }).preferredGroupId)
      : undefined;

  const isFirstPull = !account.tasksSyncCursor;
  const pullStartedAt = new Date();
  try {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    const cached = getCachedAccessToken(job.userId);
    if (cached) {
      oauth2.setCredentials({ access_token: cached, refresh_token: refreshToken });
    } else {
      oauth2.setCredentials({ refresh_token: refreshToken });
      const tok = await oauth2.getAccessToken();
      if (tok.token) setCachedAccessToken(job.userId, tok.token);
    }
    const tasksApi = google.tasks({ version: "v1", auth: oauth2 });

    if (isFirstPull) {
      const backfilled = await backfillOpenTasks(job.userId);
      logger.info({ userId: job.userId, backfilled }, "first pull — backfill push enqueued");
    }

    const listIds = await resolvePullListIds(tasksApi);
    if (listIds.length === 0) {
      await scheduleNextPoll(account.id, 0);
      await prismaWrite.userGoogleAccount.update({
        where: { id: account.id },
        data: { tasksLastPullAt: pullStartedAt, tasksSyncCursor: pullStartedAt },
      });
      await markJobDone(job.id);
      return;
    }

    const cursor = account.tasksSyncCursor;
    const updatedMin = cursor
      ? new Date(cursor.getTime() - OVERLAP_MS).toISOString()
      : undefined;

    let applied = 0;
    const changedFields: string[] = [];
    const signals: GoogleSignal[] = [];

    for (const listId of listIds) {
      const items = await listAllTasks(tasksApi, listId, updatedMin);
      for (const item of items) {
        if (!item.id) continue;
        const notes = item.notes ?? "";
        const { taskId: taskIdFromMarker, personal } = splitGoogleNotes(notes);

        let link =
          (await prismaRead.googleTaskLink.findFirst({
            where: {
              userId: job.userId,
              googleTasklistId: listId,
              googleTaskId: item.id,
            },
          })) ??
          (taskIdFromMarker
            ? await prismaRead.googleTaskLink.findUnique({
                where: { taskId_userId: { taskId: taskIdFromMarker, userId: job.userId } },
              })
            : null);

        // Task tạo trên Google (không marker / chưa link) → import vào app
        if (!link && !taskIdFromMarker) {
          if (!IMPORT_NATIVE || item.deleted) continue;
          // Lần pull đầu (không updatedMin): chỉ import task cập nhật trong 24h
          // để tránh đổ cả lịch sử My Tasks vào group.
          if (!updatedMin) {
            const updatedMs = item.updated ? new Date(item.updated).getTime() : 0;
            if (!updatedMs || Date.now() - updatedMs > 24 * 60 * 60 * 1000) continue;
          }
          const importedId = await importGoogleNativeTask({
            userId: job.userId,
            listId,
            item,
            tasksApi,
            preferredGroupId,
          });
          if (!importedId) continue;
          applied += 1;
          changedFields.push("imported");
          signals.push({
            userId: job.userId,
            taskId: importedId,
            kind: "created",
            changedFields: ["imported"],
            payload: { title: item.title, googleTaskId: item.id },
          });
          link = await prismaRead.googleTaskLink.findUnique({
            where: { taskId_userId: { taskId: importedId, userId: job.userId } },
          });
          if (!link) continue;
        }

        const taskId = link?.taskId ?? taskIdFromMarker!;
        if (item.deleted) {
          if (link && link.status !== "DETACHED") {
            await prismaWrite.googleTaskLink.update({
              where: { id: link.id },
              data: { status: "DETACHED", updatedAt: new Date() },
            });

            const local = await prismaRead.task.findUnique({
              where: { id: taskId },
              select: { id: true, deletedAt: true, groupId: true },
            });
            if (local && !local.deletedAt) {
              const children = await prismaRead.task.findMany({
                where: { parentId: taskId, deletedAt: null },
                select: { id: true },
              });
              const toDelete = [taskId, ...children.map((c) => c.id)];
              const now = new Date();
              await prismaWrite.$transaction(async (tx) => {
                for (const id of toDelete) {
                  await tx.task.update({
                    where: { id },
                    data: { deletedAt: now, version: { increment: 1 } },
                  });
                  await tx.taskEvent.create({
                    data: {
                      taskId: id,
                      eventType: "TaskDeleted",
                      actorUserId: job.userId,
                      actorVia: "google",
                      payload: { source: "google_tasks_delete", groupId: local.groupId },
                    },
                  });
                }
              });
              for (const id of toDelete) {
                await enqueueTaskDeletesForAppTask(id);
              }
            }

            applied += 1;
            changedFields.push("deleted");
            signals.push({
              userId: job.userId,
              taskId,
              kind: "deleted",
              changedFields: ["deleted"],
            });
          }
          continue;
        }

        const googleDone = item.status === "completed";
        const googleCompletedAt = item.completed ? new Date(item.completed) : null;
        const googleUpdatedAt = item.updated ? new Date(item.updated) : null;

        // Đảm bảo assignee tồn tại (task push trước đây có thể không có assignee)
        let assignee = await prismaRead.taskAssignee.findUnique({
          where: { taskId_userId: { taskId, userId: job.userId } },
        });
        if (!assignee) {
          const taskExists = await prismaRead.task.findFirst({
            where: { id: taskId, deletedAt: null },
          });
          if (!taskExists) continue;
          assignee = await prismaWrite.taskAssignee.create({
            data: {
              taskId,
              userId: job.userId,
              status: googleDone ? "DONE" : "ACTIVE",
              completedAt: googleDone ? googleCompletedAt ?? new Date() : null,
              completedSource: googleDone ? "google" : null,
              personalNote: personal || null,
            },
          });
          applied += 1;
          changedFields.push("assignee");
        }

        if (
          shouldApplyGoogleCompletion({
            googleCompleted: googleDone,
            googleCompletedAt,
            localStatus: assignee.status,
            localCompletedAt: assignee.completedAt,
            localCompletedSource: assignee.completedSource,
          })
        ) {
          await applyGoogleCompletion(taskId, job.userId, item.etag ?? null, link?.id);
          applied += 1;
          changedFields.push("status");
          signals.push({
            userId: job.userId,
            taskId,
            kind: "status",
            changedFields: ["status"],
            payload: { status: "DONE", source: "google" },
          });
        } else if (
          shouldApplyGoogleUncomplete({
            googleCompleted: googleDone,
            googleUpdatedAt,
            localStatus: assignee.status,
            localCompletedAt: assignee.completedAt,
            localCompletedSource: assignee.completedSource,
          })
        ) {
          await prismaWrite.taskAssignee.update({
            where: { taskId_userId: { taskId, userId: job.userId } },
            data: { status: "ACTIVE", completedAt: null, completedSource: null },
          });
          applied += 1;
          changedFields.push("status");
          signals.push({
            userId: job.userId,
            taskId,
            kind: "status",
            changedFields: ["status"],
            payload: { status: "ACTIVE", source: "google" },
          });
        }

        if (personal && personal !== (assignee.personalNote ?? "")) {
          await prismaWrite.taskAssignee.update({
            where: { taskId_userId: { taskId, userId: job.userId } },
            data: { personalNote: personal.slice(0, 4000) },
          });
          applied += 1;
          changedFields.push("notes");
          signals.push({
            userId: job.userId,
            taskId,
            kind: "notes",
            changedFields: ["notes"],
          });
        }

        if (item.title && link) {
          const task = await prismaRead.task.findUnique({ where: { id: taskId } });
          if (
            task &&
            task.createdById === job.userId &&
            item.title !== task.title &&
            !localWinsConflict(task.updatedAt, item.updated)
          ) {
            await prismaWrite.task.update({
              where: { id: taskId },
              data: { title: item.title, version: { increment: 1 } },
            });
            applied += 1;
            changedFields.push("title");
            signals.push({
              userId: job.userId,
              taskId,
              kind: "title",
              changedFields: ["title"],
              payload: { title: item.title },
            });
          }
        }

        {
          const googleDue = googleDueToDateOnly(item.due);
          const task = await prismaRead.task.findUnique({ where: { id: taskId } });
          if (task && !localWinsConflict(task.updatedAt, item.updated)) {
            const localDue = formatDbDue(task.dueDate);
            if (googleDue !== localDue) {
              await prismaWrite.task.update({
                where: { id: taskId },
                data: {
                  dueDate: googleDue ? new Date(`${googleDue}T00:00:00.000Z`) : null,
                  version: { increment: 1 },
                },
              });
              applied += 1;
              changedFields.push("due");
              signals.push({
                userId: job.userId,
                taskId,
                kind: "due",
                changedFields: ["due"],
                payload: { dueDate: googleDue },
              });
            }
          }
        }

        {
          const desiredParentId = await resolveLocalParentIdFromGoogle(
            job.userId,
            listId,
            item.parent ?? undefined,
          );
          const taskRow = await prismaRead.task.findUnique({ where: { id: taskId } });
          if (
            taskRow &&
            !localWinsConflict(taskRow.updatedAt, item.updated) &&
            desiredParentId !== taskRow.parentId
          ) {
            await prismaWrite.task.update({
              where: { id: taskId },
              data: { parentId: desiredParentId, version: { increment: 1 } },
            });
            applied += 1;
            changedFields.push("parent");
          }
        }

        if (link) {
          await prismaWrite.googleTaskLink.update({
            where: { id: link.id },
            data: {
              etag: item.etag ?? link.etag,
              fieldHashes: buildFieldHashes({
                title: item.title ?? undefined,
                notes: item.notes ?? undefined,
                status: item.status ?? undefined,
                due: googleDueToDateOnly(item.due),
              }),
              updatedAt: new Date(),
            },
          });
        }
      }
    }

    await scheduleNextPoll(account.id, applied);
    await prismaWrite.userGoogleAccount.update({
      where: { id: account.id },
      data: { tasksLastPullAt: pullStartedAt, tasksSyncCursor: pullStartedAt },
    });

    await emitGoogleSignals(signals);
    if (applied > 0) {
      await emitGoogleSignals([
        {
          userId: job.userId,
          kind: "digest",
          changedFields: [...new Set(changedFields)],
          payload: { applied },
        },
      ]);
    }

    await markJobDone(job.id);
    logger.info(
      { jobId: job.id, userId: job.userId, applied, changedFields: [...new Set(changedFields)] },
      "TASKS_PULL done",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("invalid_grant")) {
      clearCachedAccessToken(job.userId);
      await markJobAuthRequired(job.id, msg);
      return;
    }
    const backoff = Math.min(60_000 * Math.max(1, job.attempts), 15 * 60_000);
    await markJobRetry(job.id, msg, backoff, job.attempts);
    logger.warn({ err, jobId: job.id }, "TASKS_PULL failed — retry");
  }
}

/** Enqueue PUSH cho task ACTIVE của user chưa có link LINKED. */
async function backfillOpenTasks(userId: string): Promise<number> {
  const assignees = await prismaRead.taskAssignee.findMany({
    where: { userId, status: "ACTIVE" },
    include: { task: true },
    take: 100,
  });
  let n = 0;
  for (const a of assignees) {
    if (a.task.deletedAt || a.task.status === "DONE") continue;
    const link = await prismaRead.googleTaskLink.findUnique({
      where: { taskId_userId: { taskId: a.taskId, userId } },
    });
    if (link?.status === "LINKED" || link?.status === "CREATING") continue;
    await enqueueTaskPush({
      userId,
      taskId: a.taskId,
      title: a.task.title,
      notes: a.personalNote ?? "",
      status: a.task.status,
      due: formatDbDue(a.task.dueDate),
    });
    n += 1;
  }
  return n;
}

/** Poll nền giãn dần khi empty: 1→2→4→15 phút. */
async function scheduleNextPoll(accountId: string, applied: number): Promise<void> {
  const account = await prismaRead.userGoogleAccount.findUnique({ where: { id: accountId } });
  if (!account) return;
  let streak = account.tasksEmptyStreak;
  let interval = account.tasksPollIntervalS || POLL_MIN_S;
  if (applied === 0) {
    streak += 1;
    if (streak >= 2) interval = Math.min(interval * 2, POLL_MAX_S);
  } else {
    streak = 0;
    interval = POLL_MIN_S;
  }
  await prismaWrite.userGoogleAccount.update({
    where: { id: accountId },
    data: {
      tasksEmptyStreak: streak,
      tasksPollIntervalS: interval,
      tasksNextPollAt: new Date(Date.now() + interval * 1000),
    },
  });
}

async function applyGoogleCompletion(
  taskId: string,
  userId: string,
  etag: string | null,
  linkId?: string,
): Promise<void> {
  await prismaWrite.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.taskAssignee.update({
      where: { taskId_userId: { taskId, userId } },
      data: {
        status: "DONE",
        completedAt: new Date(),
        completedSource: "google",
      },
    });
    const task = await tx.task.findUnique({ where: { id: taskId } });
    if (!task) return;

    let taskStatus = task.status;
    if (task.completionMode === "ANY") {
      taskStatus = "DONE";
    } else {
      const remaining = await tx.taskAssignee.count({
        where: { taskId, status: "ACTIVE" },
      });
      if (remaining === 0) taskStatus = "DONE";
    }
    await tx.task.update({
      where: { id: taskId },
      data: { status: taskStatus, version: { increment: 1 } },
    });
    await tx.taskEvent.create({
      data: {
        taskId,
        eventType: "TaskCompleted",
        actorUserId: userId,
        actorVia: "google",
        payload: { taskStatus, source: "google_pull" },
      },
    });
    if (linkId) {
      await tx.googleTaskLink.update({
        where: { id: linkId },
        data: { etag, updatedAt: new Date() },
      });
    }
  });
}

/**
 * List cần kéo: "Manage Teams" + My Tasks (@default).
 * User thường tạo task trên My Tasks — trước đây bị bỏ qua hoàn toàn.
 */
async function resolvePullListIds(
  tasksApi: ReturnType<typeof google.tasks>,
): Promise<string[]> {
  const ids = new Set<string>();
  const listed = await tasksApi.tasklists.list({ maxResults: 100 });
  for (const item of listed.data.items ?? []) {
    if (!item.id) continue;
    if (item.title === listTitle || item.id === "@default") {
      ids.add(item.id);
    }
  }
  // Một số tài khoản My Tasks không có title đặc biệt — luôn thử @default
  ids.add("@default");
  // Đảm bảo list app tồn tại (tạo nếu thiếu) để push/pull cùng chỗ
  const app = listed.data.items?.find((i) => i.title === listTitle);
  if (app?.id) ids.add(app.id);
  return [...ids];
}

async function listAllTasks(
  tasksApi: ReturnType<typeof google.tasks>,
  listId: string,
  updatedMin?: string,
): Promise<tasks_v1.Schema$Task[]> {
  const out: tasks_v1.Schema$Task[] = [];
  let pageToken: string | undefined;
  try {
    do {
      const listed = await tasksApi.tasks.list({
        tasklist: listId,
        showCompleted: true,
        showHidden: true,
        showDeleted: true,
        updatedMin,
        maxResults: 100,
        pageToken,
        fields: "nextPageToken,items(id,etag,title,notes,status,updated,deleted,completed,due,parent)",
      });
      out.push(...(listed.data.items ?? []));
      pageToken = listed.data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (err) {
    // @default có thể 404 trên một số account — bỏ qua list đó
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ listId, msg }, "tasks.list failed for list — skip");
  }
  return out;
}

async function resolveImportGroupId(
  userId: string,
  preferredGroupId?: string,
): Promise<string | null> {
  if (preferredGroupId) {
    const m = await prismaRead.groupMember.findFirst({
      where: { userId, groupId: preferredGroupId, status: "ACTIVE" },
    });
    if (m) return preferredGroupId;
  }
  const owner = await prismaRead.groupMember.findFirst({
    where: { userId, status: "ACTIVE", role: "OWNER" },
    orderBy: { groupId: "asc" },
  });
  if (owner) return owner.groupId;
  const any = await prismaRead.groupMember.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { groupId: "asc" },
  });
  return any?.groupId ?? null;
}

async function resolveLocalParentIdFromGoogle(
  userId: string,
  listId: string,
  googleParentId: string | null | undefined,
): Promise<string | null> {
  if (!googleParentId) return null;
  const parentLink = await prismaRead.googleTaskLink.findFirst({
    where: {
      userId,
      googleTasklistId: listId,
      googleTaskId: googleParentId,
      status: "LINKED",
    },
  });
  if (!parentLink) return null;
  const parentTask = await prismaRead.task.findFirst({
    where: { id: parentLink.taskId, deletedAt: null, parentId: null },
  });
  return parentTask?.id ?? null;
}

async function nextTaskCode(tx: Prisma.TransactionClient, groupId: string): Promise<string> {
  const rows = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('task_code_seq') AS n`;
  const n = Number(rows[0]!.n);
  const group = await tx.group.findUnique({ where: { id: groupId } });
  const prefix =
    (group?.name ?? "GRP")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 3)
      .toUpperCase() || "GRP";
  return `${prefix}-${n}`;
}

/** Tạo Task local từ Google task chưa từng liên kết. */
async function importGoogleNativeTask(opts: {
  userId: string;
  listId: string;
  item: tasks_v1.Schema$Task;
  tasksApi: ReturnType<typeof google.tasks>;
  preferredGroupId?: string;
}): Promise<string | null> {
  const { userId, listId, item, tasksApi, preferredGroupId } = opts;
  if (!item.id || !(item.title ?? "").trim()) return null;

  // Đã có link theo googleTaskId (race / list khác)
  const existingByGoogle = await prismaRead.googleTaskLink.findFirst({
    where: { googleTasklistId: listId, googleTaskId: item.id },
  });
  if (existingByGoogle) return existingByGoogle.taskId;

  const groupId = await resolveImportGroupId(userId, preferredGroupId);
  if (!groupId) {
    logger.warn({ userId }, "import Google task skipped — user không thuộc group nào");
    return null;
  }

  const googleDone = item.status === "completed";
  const personal = (item.notes ?? "").trim().slice(0, 4000);
  const dueOnly = googleDueToDateOnly(item.due);
  const parentId = await resolveLocalParentIdFromGoogle(
    userId,
    listId,
    item.parent ?? undefined,
  );

  try {
    const task = await prismaWrite.$transaction(async (tx) => {
      const code = await nextTaskCode(tx, groupId);
      const t = await tx.task.create({
        data: {
          groupId,
          code,
          title: (item.title ?? "Untitled").slice(0, 300),
          description: personal || null,
          status: googleDone ? "DONE" : "IN_PROGRESS",
          completionMode: "ANY",
          allowClaim: true,
          createdById: userId,
          dueDate: dueOnly ? new Date(`${dueOnly}T00:00:00.000Z`) : null,
          parentId,
        },
      });
      await tx.taskAssignee.create({
        data: {
          taskId: t.id,
          userId,
          status: googleDone ? "DONE" : "ACTIVE",
          personalNote: personal || null,
          completedAt: googleDone
            ? item.completed
              ? new Date(item.completed)
              : new Date()
            : null,
          completedSource: googleDone ? "google" : null,
        },
      });
      await tx.googleTaskLink.create({
        data: {
          taskId: t.id,
          userId,
          googleTasklistId: listId,
          googleTaskId: item.id!,
          etag: item.etag ?? null,
          status: "LINKED",
          contentHash: JSON.stringify({
            title: item.title,
            notes: composePushNotes(t.id, personal),
            status: googleDone ? "DONE" : "IN_PROGRESS",
            due: dueOnly,
          }),
          fieldHashes: buildFieldHashes({
            title: item.title ?? undefined,
            notes: item.notes ?? undefined,
            status: item.status ?? undefined,
            due: dueOnly,
          }),
        },
      });
      await tx.taskEvent.create({
        data: {
          taskId: t.id,
          eventType: "TaskImportedFromGoogle",
          actorUserId: userId,
          actorVia: "google",
          payload: { googleTaskId: item.id, listId },
        },
      });
      return t;
    });

    // Ghi marker [app:uuid] lên Google để lần pull sau không import trùng
    try {
      await tasksApi.tasks.patch({
        tasklist: listId,
        task: item.id,
        requestBody: { notes: composePushNotes(task.id, personal) },
      });
    } catch (err) {
      logger.warn({ err, taskId: task.id }, "failed to write app marker back to Google");
    }

    logger.info(
      { taskId: task.id, userId, listId, googleTaskId: item.id },
      "imported Google native task",
    );
    return task.id;
  } catch (err) {
    logger.warn({ err, googleTaskId: item.id }, "import Google native task failed");
    return null;
  }
}
