import { AppError } from "@manage-teams/lib";
import { prismaRead, prismaWrite, Prisma } from "@manage-teams/db";
import { TOPICS } from "@manage-teams/contracts";
import { requireGroupMember } from "../access/access.service.js";
import {
  envelope,
  notifyChat,
  notifyGoogleTaskDelete,
  notifyGoogleTaskPush,
} from "../../infra/outbox.service.js";
import {
  isTaskBoardStatus,
  planStatusMove,
  type TaskBoardStatus,
} from "./status-move.js";
import {
  getTaskDetailCache,
  getTaskListCache,
  invalidateGroupTaskCaches,
  setTaskDetailCache,
  setTaskListCache,
} from "../../infra/task-cache.js";

export type CreateTaskInput = {
  title: string;
  description?: string;
  completionMode: "ANY" | "ALL";
  maxAssignees?: number;
  allowClaim: boolean;
  assigneeIds?: string[];
  dueDate?: string | null;
  parentCode?: string;
};

export type ListTasksOptions = {
  rootsOnly?: boolean;
};

async function resolveParentIdOrThrow(
  tx: Prisma.TransactionClient,
  groupId: string,
  parentCode: string,
): Promise<string> {
  const parent = await tx.task.findUnique({
    where: { groupId_code: { groupId, code: parentCode } },
  });
  if (!parent || parent.deletedAt) {
    throw new AppError("Task cha không hợp lệ", "INVALID_PARENT", 400);
  }
  if (parent.parentId) {
    throw new AppError("Task cha đã là subtask", "PARENT_IS_CHILD", 400);
  }
  return parent.id;
}

export type PatchTaskInput = {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  status?: TaskBoardStatus;
  starred?: boolean;
};

const DUE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function formatDue(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function parseDueOrThrow(dueDate: string | null | undefined): Date | null | undefined {
  if (dueDate === undefined) return undefined;
  if (dueDate === null) return null;
  if (!DUE_RE.test(dueDate)) {
    throw new AppError("Ngày hạn phải theo định dạng YYYY-MM-DD", "INVALID_DUE_DATE", 400);
  }
  return new Date(`${dueDate}T00:00:00.000Z`);
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

async function pushToAssignees(
  taskId: string,
  title: string,
  notes: string | null | undefined,
  status: string,
  due: string | null,
  userIds: string[],
): Promise<void> {
  for (const uid of userIds) {
    void notifyGoogleTaskPush({
      userId: uid,
      taskId,
      title,
      notes: notes ?? undefined,
      status,
      due,
    });
  }
}

export async function createTask(groupId: string, userId: string, input: CreateTaskInput) {
  await requireGroupMember(groupId, userId);
  // Pool: không auto-gán creator — claim hoặc assign sau.
  const assigneeIds = [...new Set(input.assigneeIds ?? [])];
  for (const uid of assigneeIds) {
    await requireGroupMember(groupId, uid);
  }
  const dueParsed = parseDueOrThrow(input.dueDate);

  const task = await prismaWrite.$transaction(async (tx) => {
    const code = await nextTaskCode(tx, groupId);
    let parentId: string | null = null;
    if (input.parentCode) {
      parentId = await resolveParentIdOrThrow(tx, groupId, input.parentCode);
    }
    const t = await tx.task.create({
      data: {
        groupId,
        code,
        title: input.title,
        description: input.description ?? null,
        completionMode: input.completionMode,
        maxAssignees: input.maxAssignees ?? null,
        allowClaim: input.allowClaim,
        createdById: userId,
        status: assigneeIds.length > 0 ? "IN_PROGRESS" : "TODO",
        dueDate: dueParsed === undefined ? null : dueParsed,
        parentId,
      },
    });
    for (const uid of assigneeIds) {
      await tx.taskAssignee.create({
        data: { taskId: t.id, userId: uid, status: "ACTIVE" },
      });
    }
    await tx.taskEvent.create({
      data: {
        taskId: t.id,
        eventType: "TaskCreated",
        actorUserId: userId,
        actorVia: "user",
        payload: { title: t.title, code: t.code, dueDate: formatDue(t.dueDate) },
      },
    });
    const ev = envelope({
      eventType: "TaskCreated",
      aggregateType: "task",
      aggregateId: t.id,
      aggregateVersion: t.version,
      actor: { userId, via: "user" },
      payload: { groupId, code: t.code, title: t.title },
    });
    await tx.outbox.create({
      data: { topic: TOPICS.taskEvents, payload: ev as unknown as Prisma.InputJsonValue },
    });
    return t;
  });

  const chatMembers = [...new Set([...assigneeIds, userId])];
  void notifyChat("/internal/conversations/ensure-task", {
    groupId,
    taskId: task.id,
    taskCode: task.code,
    memberIds: chatMembers,
  });

  await pushToAssignees(
    task.id,
    task.title,
    task.description,
    task.status,
    formatDue(task.dueDate),
    assigneeIds,
  );

  await invalidateGroupTaskCaches(groupId, task.id);

  return task;
}

export async function listTasks(
  groupId: string,
  userId: string,
  opts: ListTasksOptions = {},
) {
  await requireGroupMember(groupId, userId);
  if (!opts.rootsOnly) {
    const cached = await getTaskListCache(groupId);
    if (cached) return cached;
  }

  const tasks = await prismaRead.task.findMany({
    where: {
      groupId,
      deletedAt: null,
      ...(opts.rootsOnly ? { parentId: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      assignees: {
        where: { status: { in: ["ACTIVE", "DONE"] } },
        include: { user: { select: { id: true, email: true, displayName: true } } },
      },
    },
  });
  const codeById = new Map(tasks.map((t) => [t.id, t.code]));
  const mapped = tasks.map((t) => ({
    id: t.id,
    code: t.code,
    title: t.title,
    status: t.status,
    completionMode: t.completionMode,
    maxAssignees: t.maxAssignees,
    allowClaim: t.allowClaim,
    createdAt: t.createdAt,
    dueDate: formatDue(t.dueDate),
    description: t.description,
    parentId: t.parentId,
    parentCode: t.parentId ? (codeById.get(t.parentId) ?? null) : null,
    assignees: t.assignees.map((a) => ({
      userId: a.userId,
      status: a.status,
      email: a.user.email,
      displayName: a.user.displayName,
    })),
  }));
  if (!opts.rootsOnly) {
    await setTaskListCache(groupId, mapped);
  }
  return mapped;
}

export async function getTask(groupId: string, code: string, userId: string) {
  await requireGroupMember(groupId, userId);
  const head = await prismaRead.task.findUnique({
    where: { groupId_code: { groupId, code } },
    select: { id: true, version: true, deletedAt: true },
  });
  if (!head || head.deletedAt) throw new AppError("Không tìm thấy", "NOT_FOUND", 404);

  const cached = await getTaskDetailCache(head.id, head.version);
  if (cached) return cached;

  const task = await prismaRead.task.findUnique({
    where: { groupId_code: { groupId, code } },
    include: {
      assignees: {
        include: { user: { select: { id: true, email: true, displayName: true } } },
      },
      events: { orderBy: { createdAt: "asc" }, take: 50 },
    },
  });
  if (!task || task.deletedAt) throw new AppError("Không tìm thấy", "NOT_FOUND", 404);
  const detail = {
    ...task,
    dueDate: formatDue(task.dueDate),
  };
  await setTaskDetailCache(task.id, task.version, detail as Record<string, unknown>);
  return detail;
}

async function ensureActiveAssigneeInTx(
  tx: Prisma.TransactionClient,
  task: {
    id: string;
    allowClaim: boolean;
    maxAssignees: number | null;
  },
  userId: string,
): Promise<void> {
  const existing = await tx.taskAssignee.findUnique({
    where: { taskId_userId: { taskId: task.id, userId } },
  });
  if (existing?.status === "ACTIVE") return;

  if (existing) {
    await tx.taskAssignee.update({
      where: { taskId_userId: { taskId: task.id, userId } },
      data: { status: "ACTIVE", completedAt: null, completedSource: null },
    });
    return;
  }

  if (!task.allowClaim) {
    throw new AppError("Công việc không cho phép nhận việc", "CLAIM_DISABLED", 400);
  }
  const activeCount = await tx.taskAssignee.count({
    where: { taskId: task.id, status: "ACTIVE" },
  });
  if (task.maxAssignees != null && activeCount >= task.maxAssignees) {
    throw new AppError("Hết chỗ nhận việc", "CLAIM_FULL", 409);
  }
  await tx.taskAssignee.create({
    data: { taskId: task.id, userId, status: "ACTIVE" },
  });
}

async function completeAssigneeInTx(
  tx: Prisma.TransactionClient,
  task: { id: string; status: string; completionMode: string },
  userId: string,
): Promise<string> {
  const assignee = await tx.taskAssignee.findUnique({
    where: { taskId_userId: { taskId: task.id, userId } },
  });
  if (!assignee || assignee.status !== "ACTIVE") {
    throw new AppError(
      "Bạn không phải người được giao việc đang hoạt động",
      "NOT_ASSIGNEE",
      403,
    );
  }
  await tx.taskAssignee.update({
    where: { taskId_userId: { taskId: task.id, userId } },
    data: { status: "DONE", completedAt: new Date(), completedSource: "user" },
  });

  let taskStatus = task.status;
  if (task.completionMode === "ANY") {
    taskStatus = "DONE";
  } else {
    const remaining = await tx.taskAssignee.count({
      where: { taskId: task.id, status: "ACTIVE" },
    });
    if (remaining === 0) taskStatus = "DONE";
  }
  return taskStatus;
}

export async function patchTask(
  groupId: string,
  code: string,
  userId: string,
  input: PatchTaskInput,
) {
  await requireGroupMember(groupId, userId);
  if (
    input.title === undefined &&
    input.description === undefined &&
    input.dueDate === undefined &&
    input.status === undefined
  ) {
    throw new AppError("Không có trường nào để cập nhật", "EMPTY_PATCH", 400);
  }
  if (input.status !== undefined && !isTaskBoardStatus(input.status)) {
    throw new AppError("Trạng thái không hợp lệ", "INVALID_STATUS", 400);
  }
  const dueParsed = parseDueOrThrow(input.dueDate);

  const task = await prismaWrite.$transaction(async (tx) => {
    const existing = await tx.task.findUnique({ where: { groupId_code: { groupId, code } } });
    if (!existing || existing.deletedAt) throw new AppError("Không tìm thấy", "NOT_FOUND", 404);

    const data: Prisma.TaskUpdateInput = { version: { increment: 1 } };
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (dueParsed !== undefined) data.dueDate = dueParsed;

    let statusMoved = false;
    if (input.status !== undefined) {
      const from = isTaskBoardStatus(existing.status)
        ? existing.status
        : ("TODO" as TaskBoardStatus);
      const plan = planStatusMove(from, input.status);
      if (plan.kind === "move") {
        statusMoved = true;
        if (plan.ensureActiveAssignee) {
          await ensureActiveAssigneeInTx(tx, existing, userId);
        }
        if (plan.reopenAssigneeIfDone) {
          const row = await tx.taskAssignee.findUnique({
            where: { taskId_userId: { taskId: existing.id, userId } },
          });
          if (row?.status === "DONE") {
            await tx.taskAssignee.update({
              where: { taskId_userId: { taskId: existing.id, userId } },
              data: { status: "ACTIVE", completedAt: null, completedSource: null },
            });
          }
        }
        if (plan.completeAssignee) {
          const nextStatus = await completeAssigneeInTx(tx, existing, userId);
          data.status = nextStatus;
        } else {
          data.status = plan.toStatus;
        }
      }
    }

    const updated = await tx.task.update({ where: { id: existing.id }, data });
    await tx.taskEvent.create({
      data: {
        taskId: updated.id,
        eventType: "TaskUpdated",
        actorUserId: userId,
        actorVia: "user",
        payload: {
          title: input.title,
          dueDate: input.dueDate,
          status: statusMoved ? updated.status : undefined,
        },
      },
    });
    const ev = envelope({
      eventType: "TaskUpdated",
      aggregateType: "task",
      aggregateId: updated.id,
      aggregateVersion: updated.version,
      actor: { userId, via: "user" },
      payload: {
        groupId,
        code,
        dueDate: formatDue(updated.dueDate),
        status: updated.status,
      },
    });
    await tx.outbox.create({
      data: { topic: TOPICS.taskEvents, payload: ev as unknown as Prisma.InputJsonValue },
    });
    return updated;
  });

  const pushUserIds = new Set<string>([userId]);
  const active = await prismaRead.taskAssignee.findMany({
    where: { taskId: task.id, status: "ACTIVE" },
    select: { userId: true },
  });
  for (const a of active) pushUserIds.add(a.userId);
  await pushToAssignees(
    task.id,
    task.title,
    task.description,
    task.status,
    formatDue(task.dueDate),
    [...pushUserIds],
  );

  await invalidateGroupTaskCaches(groupId, task.id);

  return {
    id: task.id,
    code: task.code,
    title: task.title,
    status: task.status,
    dueDate: formatDue(task.dueDate),
    description: task.description,
  };
}

export async function claimTask(groupId: string, code: string, userId: string) {
  await requireGroupMember(groupId, userId);
  const result = await prismaWrite.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<
      {
        id: string;
        title: string;
        description: string | null;
        status: string;
        max_assignees: number | null;
        allow_claim: boolean;
        version: number;
        due_date: Date | null;
      }[]
    >`SELECT id, title, description, status, max_assignees, allow_claim, version, due_date FROM tasks
      WHERE group_id = ${groupId}::uuid AND code = ${code} AND deleted_at IS NULL
      FOR UPDATE`;
    const row = locked[0];
    if (!row) throw new AppError("Không tìm thấy", "NOT_FOUND", 404);
    if (!row.allow_claim) throw new AppError("Công việc không cho phép nhận việc", "CLAIM_DISABLED", 400);

    const existing = await tx.taskAssignee.findUnique({
      where: { taskId_userId: { taskId: row.id, userId } },
    });
    if (existing?.status === "ACTIVE") {
      return {
        already: true as const,
        taskId: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        dueDate: formatDue(row.due_date),
      };
    }

    const activeCount = await tx.taskAssignee.count({
      where: { taskId: row.id, status: "ACTIVE" },
    });
    if (row.max_assignees != null && activeCount >= row.max_assignees) {
      throw new AppError("Hết chỗ nhận việc", "CLAIM_FULL", 409);
    }

    if (existing) {
      await tx.taskAssignee.update({
        where: { taskId_userId: { taskId: row.id, userId } },
        data: { status: "ACTIVE", completedAt: null, completedSource: null },
      });
    } else {
      await tx.taskAssignee.create({
        data: { taskId: row.id, userId, status: "ACTIVE" },
      });
    }
    await tx.task.update({
      where: { id: row.id },
      data: { version: { increment: 1 }, status: "IN_PROGRESS" },
    });
    await tx.taskEvent.create({
      data: {
        taskId: row.id,
        eventType: "TaskClaimed",
        actorUserId: userId,
        actorVia: "user",
        payload: {},
      },
    });
    const ev = envelope({
      eventType: "TaskClaimed",
      aggregateType: "task",
      aggregateId: row.id,
      aggregateVersion: row.version + 1,
      actor: { userId, via: "user" },
      payload: { groupId, code },
    });
    await tx.outbox.create({
      data: { topic: TOPICS.taskEvents, payload: ev as unknown as Prisma.InputJsonValue },
    });
    return {
      already: false as const,
      taskId: row.id,
      title: row.title,
      description: row.description,
      status: "IN_PROGRESS",
      dueDate: formatDue(row.due_date),
    };
  });

  if (!result.already) {
    void notifyGoogleTaskPush({
      userId,
      taskId: result.taskId,
      title: result.title,
      notes: result.description ?? undefined,
      status: result.status,
      due: result.dueDate,
    });
    await invalidateGroupTaskCaches(groupId, result.taskId);
  }
  return { already: result.already, taskId: result.taskId };
}

export async function completeTask(
  groupId: string,
  code: string,
  userId: string,
  source: "user" | "chat" | "google" = "user",
) {
  await requireGroupMember(groupId, userId);
  const result = await prismaWrite.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { groupId_code: { groupId, code } } });
    if (!task || task.deletedAt) throw new AppError("Không tìm thấy", "NOT_FOUND", 404);
    const assignee = await tx.taskAssignee.findUnique({
      where: { taskId_userId: { taskId: task.id, userId } },
    });
    if (!assignee || assignee.status !== "ACTIVE") {
      throw new AppError("Bạn không phải người được giao việc đang hoạt động", "NOT_ASSIGNEE", 403);
    }
    await tx.taskAssignee.update({
      where: { taskId_userId: { taskId: task.id, userId } },
      data: { status: "DONE", completedAt: new Date(), completedSource: source },
    });

    let taskStatus = task.status;
    if (task.completionMode === "ANY") {
      taskStatus = "DONE";
    } else {
      const remaining = await tx.taskAssignee.count({
        where: { taskId: task.id, status: "ACTIVE" },
      });
      if (remaining === 0) taskStatus = "DONE";
    }
    await tx.task.update({
      where: { id: task.id },
      data: { status: taskStatus, version: { increment: 1 } },
    });
    const actorVia = source === "google" ? "google" : source === "chat" ? "system" : "user";
    await tx.taskEvent.create({
      data: {
        taskId: task.id,
        eventType: "TaskCompleted",
        actorUserId: userId,
        actorVia,
        payload: { taskStatus, source },
      },
    });
    const ev = envelope({
      eventType: "TaskCompleted",
      aggregateType: "task",
      aggregateId: task.id,
      aggregateVersion: task.version + 1,
      actor: { userId, via: actorVia },
      payload: { groupId, code, taskStatus, source },
    });
    await tx.outbox.create({
      data: { topic: TOPICS.taskEvents, payload: ev as unknown as Prisma.InputJsonValue },
    });
    return {
      taskId: task.id,
      title: task.title,
      description: task.description,
      status: taskStatus,
      dueDate: formatDue(task.dueDate),
    };
  });

  if (source === "user") {
    void notifyGoogleTaskPush({
      userId,
      taskId: result.taskId,
      title: result.title,
      notes: result.description ?? undefined,
      status: result.status,
      due: result.dueDate,
    });
  }

  await invalidateGroupTaskCaches(groupId, result.taskId);
}

export async function assignTask(
  groupId: string,
  code: string,
  actorId: string,
  targetUserId: string,
) {
  await requireGroupMember(groupId, actorId);
  await requireGroupMember(groupId, targetUserId);

  const task = await prismaWrite.$transaction(async (tx) => {
    const t = await tx.task.findUnique({ where: { groupId_code: { groupId, code } } });
    if (!t || t.deletedAt) throw new AppError("Không tìm thấy", "NOT_FOUND", 404);
    const activeCount = await tx.taskAssignee.count({
      where: { taskId: t.id, status: "ACTIVE" },
    });
    if (t.maxAssignees != null && activeCount >= t.maxAssignees) {
      throw new AppError("Đã hết chỗ người được giao", "ASSIGN_FULL", 409);
    }
    await tx.taskAssignee.upsert({
      where: { taskId_userId: { taskId: t.id, userId: targetUserId } },
      create: { taskId: t.id, userId: targetUserId, status: "ACTIVE" },
      update: { status: "ACTIVE", completedAt: null },
    });
    const nextStatus = t.status === "TODO" ? "IN_PROGRESS" : t.status;
    const updated = await tx.task.update({
      where: { id: t.id },
      data: {
        status: nextStatus,
        version: { increment: 1 },
      },
    });
    await tx.taskEvent.create({
      data: {
        taskId: t.id,
        eventType: "TaskAssigned",
        actorUserId: actorId,
        actorVia: "user",
        payload: { userId: targetUserId },
      },
    });
    return updated;
  });

  void notifyGoogleTaskPush({
    userId: targetUserId,
    taskId: task.id,
    title: task.title,
    notes: task.description ?? undefined,
    status: task.status,
    due: formatDue(task.dueDate),
  });

  await invalidateGroupTaskCaches(groupId, task.id);
}

/** Soft-delete task (+ subtask con); đồng bộ xóa Google Tasks. */
export async function deleteTask(groupId: string, code: string, userId: string) {
  const { role } = await requireGroupMember(groupId, userId);

  const existing = await prismaRead.task.findUnique({
    where: { groupId_code: { groupId, code } },
    select: { id: true, code: true, version: true, deletedAt: true, createdById: true },
  });
  if (!existing || existing.deletedAt) {
    throw new AppError("Không tìm thấy", "NOT_FOUND", 404);
  }

  const canDelete =
    existing.createdById === userId || role === "OWNER" || role === "ADMIN";
  if (!canDelete) {
    throw new AppError("Không có quyền xóa công việc", "FORBIDDEN", 403);
  }

  const children = await prismaRead.task.findMany({
    where: { parentId: existing.id, deletedAt: null },
    select: { id: true, code: true },
  });
  const toDelete = [{ id: existing.id, code: existing.code }, ...children];
  const now = new Date();

  await prismaWrite.$transaction(async (tx) => {
    for (const row of toDelete) {
      await tx.task.update({
        where: { id: row.id },
        data: { deletedAt: now, version: { increment: 1 } },
      });
      await tx.taskEvent.create({
        data: {
          taskId: row.id,
          eventType: "TaskDeleted",
          actorUserId: userId,
          actorVia: "user",
          payload: { groupId, code: row.code },
        },
      });
      const ev = envelope({
        eventType: "TaskDeleted",
        aggregateType: "task",
        aggregateId: row.id,
        aggregateVersion: existing.version + 1,
        actor: { userId, via: "user" },
        payload: { groupId, code: row.code },
      });
      await tx.outbox.create({
        data: { topic: TOPICS.taskEvents, payload: ev as unknown as Prisma.InputJsonValue },
      });
    }
  });

  await invalidateGroupTaskCaches(groupId, existing.id);
  for (const child of children) {
    await invalidateGroupTaskCaches(groupId, child.id);
  }

  for (const row of toDelete) {
    void notifyGoogleTaskDelete(row.id);
  }

  return { deleted: true, codes: toDelete.map((t) => t.code) };
}
