import { createHash, randomUUID } from "node:crypto";
import { prismaRead, prismaWrite } from "@manage-teams/db";
import { AppError, createLogger, endSpan, isAppError, startSpan } from "@manage-teams/lib";
import { enqueueSheetsJob } from "./sync.service.js";
import {
  DEFAULT_WRITABLE,
  filterWritablePatch,
  matrixHash,
  parseSheetValues,
  rowHash,
  rowsToValues,
  type SheetRow,
} from "./sheets-matrix.js";
import {
  ensureLiveSpreadsheet,
  isRealSpreadsheetId,
  livePullValues,
  livePushMatrix,
  liveRegisterDriveWatch,
} from "./sheets-live.js";
import { trackGoogleCall } from "./metrics.js";
import { markJobAuthRequired, markJobDone, markJobRetry } from "./sync.service.js";

const logger = createLogger("google-sync-service");
const SHEETS_DEBOUNCE_MS = Number(process.env.GOOGLE_SHEETS_DEBOUNCE_MS ?? 45_000);
const LIVE = process.env.GOOGLE_SHEETS_LIVE === "true";

/** Build rows từ tasks nhóm (một hàng / assignee ACTIVE|DONE). */
export async function buildGroupSheetRows(groupId: string): Promise<SheetRow[]> {
  const tasks = await prismaRead.task.findMany({
    where: { groupId, deletedAt: null },
    include: { assignees: true },
    orderBy: { code: "asc" },
    take: 500,
  });
  const rows: SheetRow[] = [];
  for (const t of tasks) {
    if (t.assignees.length === 0) {
      rows.push({
        code: t.code,
        title: t.title,
        status: t.status,
        personal_note: "",
        assignee_user_id: "",
      });
      continue;
    }
    for (const a of t.assignees) {
      rows.push({
        code: t.code,
        title: t.title,
        status: a.status === "DONE" ? "DONE" : t.status,
        personal_note: a.personalNote ?? "",
        assignee_user_id: a.userId,
      });
    }
  }
  return rows;
}

/** Đảm bảo có group_sheets row (owner = user enqueue). */
export async function ensureGroupSheet(groupId: string, ownerUserId: string) {
  return prismaWrite.groupSheet.upsert({
    where: { groupId },
    create: {
      groupId,
      ownerUserId,
      status: "PENDING",
      writableColumns: DEFAULT_WRITABLE,
      spreadsheetId: LIVE ? null : `local-sheet-${groupId.slice(0, 8)}`,
      driveFileId: LIVE ? null : `local-drive-${groupId.slice(0, 8)}`,
    },
    update: {
      ownerUserId,
      updatedAt: new Date(),
    },
  });
}

/** Enqueue SHEETS_PUSH với debounce 30–60s. */
export async function enqueueSheetsPushDebounced(input: {
  userId: string;
  groupId: string;
  payload?: unknown;
}) {
  await ensureGroupSheet(input.groupId, input.userId);
  const result = await enqueueSheetsJob({
    ...input,
    direction: "PUSH",
    payload: input.payload,
  });
  // Kéo nextRunAt ra debounce nếu vừa tạo
  if (!result.deduped) {
    await prismaWrite.syncJob.update({
      where: { id: result.jobId },
      data: { nextRunAt: new Date(Date.now() + SHEETS_DEBOUNCE_MS) },
    });
  }
  return { ...result, debounceMs: SHEETS_DEBOUNCE_MS };
}

export async function processSheetsPushJob(job: {
  id: string;
  userId: string;
  aggregateId: string;
  payload: unknown;
  attempts: number;
}): Promise<void> {
  try {
    const groupId = job.aggregateId;
    const rows = await buildGroupSheetRows(groupId);
    const hash = matrixHash(rows);
    const hashes: Record<string, string> = {};
    for (const r of rows) hashes[`${r.code}:${r.assignee_user_id}`] = rowHash(r);

    const sheet = await ensureGroupSheet(groupId, job.userId);
    if (sheet.contentHash === hash) {
      await markJobDone(job.id);
      logger.info({ jobId: job.id, groupId }, "SHEETS_PUSH skipped — unchanged");
      return;
    }

    if (LIVE) {
      const span = startSpan("sheets.push.live", { groupId });
      try {
        const { spreadsheetId, created } = await ensureLiveSpreadsheet({
          userId: job.userId,
          groupId,
          spreadsheetId: isRealSpreadsheetId(sheet.spreadsheetId)
            ? sheet.spreadsheetId
            : null,
        });
        await livePushMatrix({ userId: job.userId, spreadsheetId, rows });
        await prismaWrite.groupSheet.update({
          where: { groupId },
          data: {
            status: "PUSHED",
            lastPushAt: new Date(),
            contentHash: hash,
            rowHashes: hashes,
            spreadsheetId,
            driveFileId: spreadsheetId,
            updatedAt: new Date(),
          },
        });
        trackGoogleCall(true, "SHEETS_PUSH");
        await markJobDone(job.id);
        endSpan(span, true);
        logger.info(
          { jobId: job.id, groupId, rows: rows.length, spreadsheetId, created },
          "SHEETS_PUSH done (LIVE)",
        );
      } catch (liveErr) {
        endSpan(span, false);
        throw liveErr;
      }
      return;
    }

    // Local deepen: lưu matrix vào contentHash + row_hashes (đại diện “đã ghi vùng”)
    await prismaWrite.groupSheet.update({
      where: { groupId },
      data: {
        status: "PUSHED",
        lastPushAt: new Date(),
        contentHash: hash,
        rowHashes: hashes,
        spreadsheetId: sheet.spreadsheetId ?? `local-sheet-${groupId.slice(0, 8)}`,
        driveFileId: sheet.driveFileId ?? `local-drive-${groupId.slice(0, 8)}`,
        updatedAt: new Date(),
      },
    });
    trackGoogleCall(true, "SHEETS_PUSH");
    await markJobDone(job.id);
    logger.info(
      { jobId: job.id, groupId, rows: rows.length, hash: hash.slice(0, 8) },
      "SHEETS_PUSH done (local matrix)",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("invalid_grant") ||
      (isAppError(err) && err.code === "AUTH_REQUIRED")
    ) {
      await markJobAuthRequired(job.id, msg);
      return;
    }
    if (msg === "rate_limit_wait") {
      await markJobRetry(job.id, msg, 5_000, job.attempts);
      return;
    }
    trackGoogleCall(false, "SHEETS_PUSH");
    await markJobRetry(job.id, msg, 30_000, job.attempts);
  }
}

export async function processSheetsPullJob(job: {
  id: string;
  userId: string;
  aggregateId: string;
  payload?: unknown;
  attempts: number;
}): Promise<void> {
  try {
    const groupId = job.aggregateId;
    const sheet = await prismaRead.groupSheet.findUnique({ where: { groupId } });
    if (!sheet) {
      await markJobDone(job.id);
      return;
    }

    const writable = sheet.writableColumns?.length
      ? sheet.writableColumns
      : [...DEFAULT_WRITABLE];

    // Payload có thể chứa values giả lập từ Drive webhook / test
    const payload = (job.payload ?? {}) as { values?: string[][] };
    let values = payload.values;
    if (!values && LIVE) {
      if (!isRealSpreadsheetId(sheet.spreadsheetId)) {
        await markJobDone(job.id);
        logger.info({ jobId: job.id, groupId }, "SHEETS_PULL skipped — no spreadsheetId");
        return;
      }
      const span = startSpan("sheets.pull.live", { groupId });
      try {
        values = await livePullValues({
          userId: job.userId,
          spreadsheetId: sheet.spreadsheetId,
        });
        endSpan(span, true);
      } catch (liveErr) {
        endSpan(span, false);
        throw liveErr;
      }
    }
    if (!values) {
      // Không có data mới — dùng rows hiện tại từ DB làm baseline (no-op pull)
      const rows = await buildGroupSheetRows(groupId);
      values = rowsToValues(rows);
    }

    const { rows, hashes } = parseSheetValues(values);
    let applied = 0;
    for (const row of rows) {
      const key = `${row.code}:${row.assignee_user_id}`;
      const prevHashes = (sheet.rowHashes ?? {}) as Record<string, string>;
      if (prevHashes[key] === hashes[key]) {
        continue;
      }
      const patch = filterWritablePatch(row, writable);
      // Title không writable — bỏ qua dù Sheet đổi
      if (Object.keys(patch).length === 0) continue;

      const task = await prismaRead.task.findFirst({
        where: { groupId, code: row.code, deletedAt: null },
      });
      if (!task) continue;

      if (patch.status && row.assignee_user_id) {
        const st = patch.status === "DONE" ? "DONE" : "ACTIVE";
        await prismaWrite.taskAssignee.updateMany({
          where: { taskId: task.id, userId: row.assignee_user_id },
          data: {
            status: st,
            ...(st === "DONE"
              ? { completedAt: new Date(), completedSource: "sheets" }
              : { completedAt: null, completedSource: null }),
            ...(patch.personal_note != null ? { personalNote: patch.personal_note } : {}),
          },
        });
        applied += 1;
      } else if (patch.personal_note != null && row.assignee_user_id) {
        await prismaWrite.taskAssignee.updateMany({
          where: { taskId: task.id, userId: row.assignee_user_id },
          data: { personalNote: patch.personal_note },
        });
        applied += 1;
      }
    }

    await prismaWrite.groupSheet.update({
      where: { id: sheet.id },
      data: {
        lastPullAt: new Date(),
        status: "PULLED",
        rowHashes: hashes,
        contentHash: matrixHash(rows),
        updatedAt: new Date(),
      },
    });
    trackGoogleCall(true, "SHEETS_PULL");
    await markJobDone(job.id);
    logger.info({ jobId: job.id, groupId, applied, live: LIVE }, "SHEETS_PULL done");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("invalid_grant") ||
      (isAppError(err) && err.code === "AUTH_REQUIRED")
    ) {
      await markJobAuthRequired(job.id, msg);
      return;
    }
    if (msg === "rate_limit_wait") {
      await markJobRetry(job.id, msg, 5_000, job.attempts);
      return;
    }
    trackGoogleCall(false, "SHEETS_PULL");
    await markJobRetry(job.id, msg, 30_000, job.attempts);
  }
}

/** Đăng ký Drive watch channel (stub local; LIVE → Drive files.watch). */
export async function registerDriveWatch(input: {
  groupId: string;
  fileId: string;
  ttlHours?: number;
  userId?: string;
}) {
  const channelId = `ch-${randomUUID()}`;
  const token = createHash("sha256").update(`${channelId}:${input.groupId}`).digest("hex").slice(0, 32);
  const expiresAt = new Date(Date.now() + (input.ttlHours ?? 24) * 3600_000);

  let resourceId: string | null = null;
  if (LIVE) {
    const sheet = await prismaRead.groupSheet.findUnique({ where: { groupId: input.groupId } });
    const userId = input.userId ?? sheet?.ownerUserId;
    if (!userId) {
      throw new AppError("Thiếu ownerUserId để đăng ký Drive watch LIVE", "VALIDATION", 400);
    }
    const address = process.env.GOOGLE_DRIVE_WEBHOOK_URL;
    if (!address) {
      throw new AppError(
        "GOOGLE_DRIVE_WEBHOOK_URL chưa cấu hình (HTTPS công khai → /drive/webhook)",
        "CONFIG",
        500,
      );
    }
    const span = startSpan("drive.watch.live", { groupId: input.groupId });
    try {
      const live = await liveRegisterDriveWatch({
        userId,
        fileId: input.fileId,
        channelId,
        token,
        expiresAt,
        address,
      });
      resourceId = live.resourceId ?? null;
      endSpan(span, true);
    } catch (err) {
      endSpan(span, false);
      throw err;
    }
  }

  const row = await prismaWrite.driveWatchChannel.create({
    data: {
      groupId: input.groupId,
      fileId: input.fileId,
      channelId,
      resourceId,
      token,
      expiresAt,
      status: "ACTIVE",
    },
  });
  logger.info({ channelId, groupId: input.groupId, live: LIVE }, "drive watch registered");
  return {
    channelId: row.channelId,
    token: row.token,
    expiresAt: row.expiresAt,
    fileId: row.fileId,
    resourceId: row.resourceId,
    stub: !LIVE,
  };
}

/** Webhook Drive: verify token → enqueue SHEETS_PULL debounce. */
export async function handleDriveWebhook(input: {
  channelId: string;
  resourceState?: string;
  token?: string;
}) {
  const ch = await prismaRead.driveWatchChannel.findUnique({
    where: { channelId: input.channelId },
  });
  if (!ch || ch.status !== "ACTIVE") {
    throw new AppError("Unknown channel", "NOT_FOUND", 404);
  }
  if (input.token && input.token !== ch.token) {
    throw new AppError("Invalid channel token", "UNAUTHORIZED", 401);
  }
  if (ch.expiresAt < new Date()) {
    await prismaWrite.driveWatchChannel.update({
      where: { id: ch.id },
      data: { status: "EXPIRED" },
    });
    throw new AppError("Channel expired", "GONE", 410);
  }
  if (input.resourceState === "sync") {
    return { ok: true, sync: true };
  }

  const sheet = await prismaRead.groupSheet.findUnique({ where: { groupId: ch.groupId } });
  const userId = sheet?.ownerUserId;
  if (!userId) {
    return { ok: true, skipped: true, reason: "no_owner" };
  }
  const job = await enqueueSheetsJob({
    userId,
    groupId: ch.groupId,
    direction: "PULL",
  });
  await prismaWrite.syncJob.update({
    where: { id: job.jobId },
    data: { nextRunAt: new Date(Date.now() + Math.min(SHEETS_DEBOUNCE_MS, 15_000)) },
  });
  return { ok: true, ...job };
}

export async function getSheetStatus(groupId: string) {
  const sheet = await prismaRead.groupSheet.findUnique({ where: { groupId } });
  const watches = await prismaRead.driveWatchChannel.findMany({
    where: { groupId, status: "ACTIVE" },
    take: 5,
  });
  return { sheet, watches };
}
