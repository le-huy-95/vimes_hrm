import { AppError } from "@manage-teams/lib";
import { prismaRead, prismaWrite, Prisma } from "@manage-teams/db";
import { TOPICS } from "@manage-teams/contracts";
import { requireGroupAdmin, requireGroupMember } from "../access/access.service.js";
import { envelope, notifyChat, notifyGoogleTaskPush } from "../../infra/outbox.service.js";

export type CreateTaskInput = {
  title: string;
  description?: string;
  completionMode: "ANY" | "ALL";
  maxAssignees?: number;
  allowClaim: boolean;
  assigneeIds?: string[];
};

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

export async function createTask(groupId: string, userId: string, input: CreateTaskInput) {
  await requireGroupMember(groupId, userId);
  const task = await prismaWrite.$transaction(async (tx) => {
    const code = await nextTaskCode(tx, groupId);
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
      },
    });
    const assigneeIds = input.assigneeIds ?? [];
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
        payload: { title: t.title, code: t.code },
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

  void notifyChat("/internal/conversations/ensure-task", {
    groupId,
    taskId: task.id,
    taskCode: task.code,
    memberIds: input.assigneeIds ?? [userId],
  });

  const pushUsers = new Set(input.assigneeIds ?? []);
  pushUsers.add(userId);
  for (const uid of pushUsers) {
    void notifyGoogleTaskPush({
      userId: uid,
      taskId: task.id,
      title: task.title,
      notes: task.description ?? undefined,
      status: task.status,
    });
  }

  return task;
}

export async function listTasks(groupId: string, userId: string) {
  await requireGroupMember(groupId, userId);
  const tasks = await prismaRead.task.findMany({
    where: { groupId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      assignees: {
        where: { status: { in: ["ACTIVE", "DONE"] } },
        include: { user: { select: { id: true, email: true, displayName: true } } },
      },
    },
  });
  return tasks.map((t) => ({
    id: t.id,
    code: t.code,
    title: t.title,
    status: t.status,
    completionMode: t.completionMode,
    maxAssignees: t.maxAssignees,
    allowClaim: t.allowClaim,
    createdAt: t.createdAt,
    assignees: t.assignees.map((a) => ({
      userId: a.userId,
      status: a.status,
      email: a.user.email,
      displayName: a.user.displayName,
    })),
  }));
}

export async function getTask(groupId: string, code: string, userId: string) {
  await requireGroupMember(groupId, userId);
  const task = await prismaRead.task.findUnique({
    where: { groupId_code: { groupId, code } },
    include: {
      assignees: {
        include: { user: { select: { id: true, email: true, displayName: true } } },
      },
      events: { orderBy: { createdAt: "asc" }, take: 50 },
    },
  });
  if (!task || task.deletedAt) throw new AppError("Not found", "NOT_FOUND", 404);
  return task;
}

export async function claimTask(groupId: string, code: string, userId: string) {
  await requireGroupMember(groupId, userId);
  return prismaWrite.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<
      { id: string; max_assignees: number | null; allow_claim: boolean; version: number }[]
    >`SELECT id, max_assignees, allow_claim, version FROM tasks
      WHERE group_id = ${groupId}::uuid AND code = ${code} AND deleted_at IS NULL
      FOR UPDATE`;
    const row = locked[0];
    if (!row) throw new AppError("Not found", "NOT_FOUND", 404);
    if (!row.allow_claim) throw new AppError("Task không cho claim", "CLAIM_DISABLED", 400);

    const existing = await tx.taskAssignee.findUnique({
      where: { taskId_userId: { taskId: row.id, userId } },
    });
    if (existing?.status === "ACTIVE") {
      return { already: true as const, taskId: row.id };
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
    return { already: false as const, taskId: row.id };
  });
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
    if (!task || task.deletedAt) throw new AppError("Not found", "NOT_FOUND", 404);
    const assignee = await tx.taskAssignee.findUnique({
      where: { taskId_userId: { taskId: task.id, userId } },
    });
    if (!assignee || assignee.status !== "ACTIVE") {
      throw new AppError("Bạn không phải assignee active", "NOT_ASSIGNEE", 403);
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
    });    await tx.outbox.create({
      data: { topic: TOPICS.taskEvents, payload: ev as unknown as Prisma.InputJsonValue },
    });
    return { taskId: task.id, title: task.title, description: task.description, status: taskStatus };
  });

  // Anti-echo: không đẩy Google khi hoàn thành từ Google/Chat stub sẽ push riêng nếu cần
  if (source === "user") {
    void notifyGoogleTaskPush({
      userId,
      taskId: result.taskId,
      title: result.title,
      notes: result.description ?? undefined,
      status: result.status,
    });
  }
}

export async function assignTask(groupId: string, code: string, actorId: string, targetUserId: string) {
  await requireGroupAdmin(groupId, actorId);
  await requireGroupMember(groupId, targetUserId);

  await prismaWrite.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { groupId_code: { groupId, code } } });
    if (!task || task.deletedAt) throw new AppError("Not found", "NOT_FOUND", 404);
    const activeCount = await tx.taskAssignee.count({
      where: { taskId: task.id, status: "ACTIVE" },
    });
    if (task.maxAssignees != null && activeCount >= task.maxAssignees) {
      throw new AppError("Hết chỗ assignee", "ASSIGN_FULL", 409);
    }
    await tx.taskAssignee.upsert({
      where: { taskId_userId: { taskId: task.id, userId: targetUserId } },
      create: { taskId: task.id, userId: targetUserId, status: "ACTIVE" },
      update: { status: "ACTIVE", completedAt: null },
    });
    await tx.taskEvent.create({
      data: {
        taskId: task.id,
        eventType: "TaskAssigned",
        actorUserId: actorId,
        actorVia: "user",
        payload: { userId: targetUserId },
      },
    });
  });
}
