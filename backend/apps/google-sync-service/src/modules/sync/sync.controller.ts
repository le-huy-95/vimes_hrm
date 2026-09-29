import type { Request, Response } from "express";
import {
  createLogger,
  sendError,
  AppError,
  requireUser,
  getOtelSnapshot,
} from "@manage-teams/lib";
import { z } from "zod";
import {
  enqueueTaskPush,
  enqueueTaskPull,
  enqueueSheetsJob,
  enqueueFullSync,
  getSyncStatus,
} from "./sync.service.js";
import { reconcileStaleLinks } from "./reconcile.service.js";
import {
  enqueueSheetsPushDebounced,
  ensureGroupSheet,
  getSheetStatus,
  registerDriveWatch,
  handleDriveWebhook,
} from "./sheets.handler.js";
import { replayFailedSyncJobs, syncJobBacklogCounts } from "./dlq.service.js";
import { getGoogleMetrics, metricsPrometheus } from "./metrics.js";

const logger = createLogger("google-sync-service");
const internalToken = process.env.INTERNAL_SERVICE_TOKEN ?? "dev-internal-token";

const EnqueueSchema = z.object({
  userId: z.string().uuid(),
  taskId: z.string().uuid(),
  title: z.string().min(1),
  notes: z.string().optional(),
  status: z.string().optional(),
  due: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
    .optional(),
});

const PullSchema = z.object({
  userId: z.string().uuid(),
  force: z.boolean().optional(),
  preferredGroupId: z.string().uuid().optional(),
});

const UserPullSchema = z.object({
  preferredGroupId: z.string().uuid().optional(),
  /** force=true bỏ cooldown (nút Sync thủ công). Mặc định false để tiết kiệm quota Google. */
  force: z.boolean().optional(),
});

const SheetsSchema = z.object({
  userId: z.string().uuid(),
  groupId: z.string().uuid(),
  direction: z.enum(["PUSH", "PULL"]),
  payload: z.unknown().optional(),
});

function requireInternal(req: Request): void {
  if (req.header("x-internal-token") !== internalToken) {
    throw new AppError("Unauthorized", "UNAUTHORIZED", 401);
  }
}

/** POST /internal/sync/tasks/push */
export async function enqueueTask(req: Request, res: Response): Promise<void> {
  try {
    requireInternal(req);
    const body = EnqueueSchema.parse(req.body);
    res.status(202).json(await enqueueTaskPush(body));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /internal/sync/tasks/pull */
export async function enqueuePullInternal(req: Request, res: Response): Promise<void> {
  try {
    requireInternal(req);
    const body = PullSchema.parse(req.body);
    res.status(202).json(await enqueueTaskPull(body));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /sync/tasks/pull */
export async function enqueuePullUser(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const body = UserPullSchema.safeParse(req.body ?? {});
    const preferredGroupId = body.success ? body.data.preferredGroupId : undefined;
    const force = body.success ? Boolean(body.data.force) : false;
    res.status(202).json(
      await enqueueTaskPull({ userId: user.id, force, preferredGroupId }),
    );
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /sync/tasks/full — đồng bộ đầy đủ */
export async function fullSync(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    res.status(202).json(await enqueueFullSync(user.id));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** GET /sync/status */
export async function syncStatus(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    res.json(await getSyncStatus(user.id));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /internal/sync/reconcile */
export async function reconcile(req: Request, res: Response): Promise<void> {
  try {
    requireInternal(req);
    const limit = Number(req.body?.limit ?? 50);
    res.json(await reconcileStaleLinks(limit));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /internal/sync/sheets */
export async function enqueueSheets(req: Request, res: Response): Promise<void> {
  try {
    requireInternal(req);
    const body = SheetsSchema.parse(req.body);
    if (body.direction === "PUSH") {
      res.status(202).json(await enqueueSheetsPushDebounced(body));
      return;
    }
    res.status(202).json(await enqueueSheetsJob(body));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /internal/sync/sheets/ensure */
export async function ensureSheet(req: Request, res: Response): Promise<void> {
  try {
    requireInternal(req);
    const body = z
      .object({ groupId: z.string().uuid(), userId: z.string().uuid() })
      .parse(req.body);
    res.status(201).json(await ensureGroupSheet(body.groupId, body.userId));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** GET /sync/sheets/:groupId */
export async function sheetStatus(req: Request, res: Response): Promise<void> {
  try {
    await requireUser(req);
    res.json(await getSheetStatus(String(req.params.groupId)));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /sync/sheets/:groupId/ensure — Flutter: tạo/cập nhật group_sheets */
export async function ensureSheetUser(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const groupId = String(req.params.groupId);
    z.string().uuid().parse(groupId);
    res.status(201).json(await ensureGroupSheet(groupId, user.id));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /sync/sheets/:groupId/push — Flutter: enqueue PUSH (debounce ~45s) */
export async function pushSheetUser(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const groupId = String(req.params.groupId);
    z.string().uuid().parse(groupId);
    res.status(202).json(
      await enqueueSheetsPushDebounced({ userId: user.id, groupId }),
    );
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /sync/sheets/:groupId/pull — Flutter: enqueue PULL */
export async function pullSheetUser(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const groupId = String(req.params.groupId);
    z.string().uuid().parse(groupId);
    await ensureGroupSheet(groupId, user.id);
    res.status(202).json(
      await enqueueSheetsJob({ userId: user.id, groupId, direction: "PULL" }),
    );
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /internal/sync/drive/watch */
export async function driveWatch(req: Request, res: Response): Promise<void> {
  try {
    requireInternal(req);
    const body = z
      .object({
        groupId: z.string().uuid(),
        fileId: z.string().min(1),
        ttlHours: z.number().optional(),
        userId: z.string().uuid().optional(),
      })
      .parse(req.body);
    res.status(201).json(await registerDriveWatch(body));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /drive/webhook — Google Drive push notification */
export async function driveWebhook(req: Request, res: Response): Promise<void> {
  try {
    const channelId = String(req.header("x-goog-channel-id") ?? req.body?.channelId ?? "");
    const token = req.header("x-goog-channel-token") ?? req.body?.token;
    const resourceState = req.header("x-goog-resource-state") ?? req.body?.resourceState;
    res.json(
      await handleDriveWebhook({
        channelId,
        token: token ? String(token) : undefined,
        resourceState: resourceState ? String(resourceState) : undefined,
      }),
    );
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** POST /internal/sync/dlq/replay */
export async function dlqReplay(req: Request, res: Response): Promise<void> {
  try {
    requireInternal(req);
    res.json(
      await replayFailedSyncJobs({
        limit: Number(req.body?.limit ?? 20),
        includeAuthRequired: Boolean(req.body?.includeAuthRequired),
      }),
    );
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** GET /metrics — Prometheus text */
export async function metrics(_req: Request, res: Response): Promise<void> {
  try {
    const backlog = await syncJobBacklogCounts();
    const extra = {
      sync_jobs_pending: backlog.pending,
      sync_jobs_retry: backlog.retry,
      sync_jobs_running: backlog.running,
      sync_jobs_failed: backlog.failed,
      sync_jobs_auth_required: backlog.authRequired,
    };
    res.type("text/plain").send(metricsPrometheus(extra));
  } catch (err) {
    sendError(res, err, logger);
  }
}

/** GET /internal/sync/ops — JSON ops snapshot Phase 5 */
export async function opsSnapshot(req: Request, res: Response): Promise<void> {
  try {
    requireInternal(req);
    const backlog = await syncJobBacklogCounts();
    res.json({
      google: getGoogleMetrics(),
      backlog,
      otel: getOtelSnapshot(),
      sheetsLive: process.env.GOOGLE_SHEETS_LIVE === "true",
    });
  } catch (err) {
    sendError(res, err, logger);
  }
}
