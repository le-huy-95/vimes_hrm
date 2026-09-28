import { prismaRead } from "@manage-teams/db";
import type { ToolContext, ToolResult } from "./types.js";

const OPEN = ["TODO", "IN_PROGRESS"];

async function activeGroupIds(userId: string): Promise<string[]> {
  const memberships = await prismaRead.groupMember.findMany({
    where: { userId, status: "ACTIVE" },
    select: { groupId: true },
  });
  return memberships.map((m) => m.groupId);
}

export async function listMyTasks(
  ctx: ToolContext,
  args: { openOnly?: boolean } = {},
): Promise<ToolResult> {
  const openOnly = args.openOnly !== false;
  const groupIds = await activeGroupIds(ctx.userId);
  if (groupIds.length === 0) return { data: [], linkCandidates: [] };

  const tasks = await prismaRead.task.findMany({
    where: {
      groupId: { in: groupIds },
      deletedAt: null,
      ...(openOnly ? { status: { in: OPEN } } : {}),
      assignees: { some: { userId: ctx.userId, status: { in: ["ACTIVE", "DONE"] } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { id: true, groupId: true, code: true, title: true, status: true },
  });

  return {
    data: tasks,
    linkCandidates: tasks.map((t) => ({
      type: "task",
      id: t.id,
      groupId: t.groupId,
      code: t.code,
      label: `${t.code}: ${t.title}`,
    })),
  };
}

export async function searchTasks(
  ctx: ToolContext,
  args: { q?: string; status?: string } = {},
): Promise<ToolResult> {
  const groupIds = await activeGroupIds(ctx.userId);
  if (groupIds.length === 0) return { data: [], linkCandidates: [] };

  const q = args.q?.trim();
  const tasks = await prismaRead.task.findMany({
    where: {
      groupId: { in: groupIds },
      deletedAt: null,
      ...(args.status ? { status: args.status } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { id: true, groupId: true, code: true, title: true, status: true },
  });

  return {
    data: tasks,
    linkCandidates: tasks.map((t) => ({
      type: "task",
      id: t.id,
      groupId: t.groupId,
      code: t.code,
      label: `${t.code}: ${t.title}`,
    })),
  };
}

export async function getTask(
  ctx: ToolContext,
  args: { taskId?: string; code?: string; groupId?: string } = {},
): Promise<ToolResult> {
  const groupIds = await activeGroupIds(ctx.userId);
  if (groupIds.length === 0) return { data: null, linkCandidates: [] };

  const task = await prismaRead.task.findFirst({
    where: {
      deletedAt: null,
      groupId: { in: groupIds },
      ...(args.taskId ? { id: args.taskId } : {}),
      ...(args.code && args.groupId
        ? { code: args.code, groupId: args.groupId }
        : args.code
          ? { code: args.code }
          : {}),
    },
    select: {
      id: true,
      groupId: true,
      code: true,
      title: true,
      status: true,
      description: true,
      assignees: {
        where: { status: { in: ["ACTIVE", "DONE"] } },
        select: { userId: true, status: true },
      },
    },
  });

  if (!task) return { data: null, linkCandidates: [] };

  return {
    data: task,
    linkCandidates: [
      {
        type: "task",
        id: task.id,
        groupId: task.groupId,
        code: task.code,
        label: `${task.code}: ${task.title}`,
      },
    ],
  };
}

export async function getGroup(ctx: ToolContext, args: { groupId: string }): Promise<ToolResult> {
  const member = await prismaRead.groupMember.findFirst({
    where: { groupId: args.groupId, userId: ctx.userId, status: "ACTIVE" },
    select: { role: true },
  });
  if (!member) return { data: null, linkCandidates: [] };

  const group = await prismaRead.group.findFirst({
    where: { id: args.groupId },
    select: { id: true, name: true, organizationId: true },
  });
  if (!group) return { data: null, linkCandidates: [] };

  return {
    data: { ...group, role: member.role },
    linkCandidates: [{ type: "group", id: group.id, label: group.name }],
  };
}

export async function listMembers(ctx: ToolContext, args: { groupId: string }): Promise<ToolResult> {
  const allowed = await prismaRead.groupMember.findFirst({
    where: { groupId: args.groupId, userId: ctx.userId, status: "ACTIVE" },
    select: { userId: true },
  });
  if (!allowed) return { data: [], linkCandidates: [] };

  const members = await prismaRead.groupMember.findMany({
    where: { groupId: args.groupId, status: "ACTIVE" },
    select: {
      userId: true,
      role: true,
      user: { select: { displayName: true, email: true } },
    },
  });

  return {
    data: members.map((m) => ({
      userId: m.userId,
      role: m.role,
      displayName: m.user.displayName,
      email: m.user.email,
    })),
    linkCandidates: [{ type: "group", id: args.groupId, label: "group" }],
  };
}

export async function workloadSummary(ctx: ToolContext): Promise<ToolResult> {
  const listed = await listMyTasks(ctx, { openOnly: false });
  const tasks = Array.isArray(listed.data) ? listed.data : [];
  const byStatus: Record<string, number> = {};
  for (const t of tasks as Array<{ status: string }>) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  }
  const open = (tasks as Array<{ status: string }>).filter((t) => OPEN.includes(t.status));
  return {
    data: {
      total: tasks.length,
      open: open.length,
      byStatus,
      samples: open.slice(0, 5),
    },
    linkCandidates: listed.linkCandidates.filter((c) =>
      open.some((t) => (t as { id: string }).id === c.id),
    ),
  };
}

export async function getReportLink(): Promise<ToolResult> {
  return { data: { available: false }, linkCandidates: [] };
}

export async function syncStatus(ctx: ToolContext): Promise<ToolResult> {
  const accounts = await prismaRead.userGoogleAccount.findMany({
    where: { userId: ctx.userId },
    select: {
      id: true,
      accountType: true,
      isPrimary: true,
      linkedAt: true,
      tasksLastPullAt: true,
      tasksNextPollAt: true,
    },
  });

  const jobs = await prismaRead.syncJob.findMany({
    where: { userId: ctx.userId },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: {
      id: true,
      jobType: true,
      status: true,
      lastError: true,
      updatedAt: true,
      attempts: true,
    },
  });

  return {
    data: {
      googleLinked: accounts.length > 0,
      accounts: accounts.map((a) => ({
        id: a.id,
        accountType: a.accountType,
        isPrimary: a.isPrimary,
        linkedAt: a.linkedAt,
        tasksLastPullAt: a.tasksLastPullAt,
        tasksNextPollAt: a.tasksNextPollAt,
      })),
      recentJobs: jobs,
    },
    linkCandidates: [],
  };
}
