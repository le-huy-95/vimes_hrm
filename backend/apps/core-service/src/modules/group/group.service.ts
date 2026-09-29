import { AppError } from "@manage-teams/lib";
import { prismaRead, prismaWrite, Prisma } from "@manage-teams/db";
import { TOPICS } from "@manage-teams/contracts";
import { requireGroupAdmin, requireGroupMember, requireOrgAdmin, requireOrgMember } from "../access/access.service.js";
import { envelope, notifyChat } from "../../infra/outbox.service.js";

export async function createGroup(orgId: string, userId: string, name: string) {
  await requireOrgAdmin(orgId, userId);
  const group = await prismaWrite.$transaction(async (tx) => {
    const g = await tx.group.create({
      data: { organizationId: orgId, name },
    });
    await tx.groupMember.create({
      data: { groupId: g.id, userId, role: "OWNER", status: "ACTIVE" },
    });
    const ev = envelope({
      eventType: "GroupCreated",
      aggregateType: "group",
      aggregateId: g.id,
      aggregateVersion: 1,
      actor: { userId, via: "user" },
      payload: { organizationId: orgId, name: g.name },
    });
    await tx.outbox.create({
      data: { topic: TOPICS.groupEvents, payload: ev as unknown as Prisma.InputJsonValue },
    });
    return g;
  });

  void notifyChat("/internal/conversations/ensure-group", {
    groupId: group.id,
    memberIds: [userId],
  });

  return group;
}

export async function listGroups(orgId: string, userId: string) {
  await requireOrgMember(orgId, userId);
  const groups = await prismaRead.group.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    include: {
      members: { where: { userId, status: "ACTIVE" }, take: 1 },
    },
  });
  return groups.map((g) => ({
    id: g.id,
    organizationId: g.organizationId,
    name: g.name,
    myRole: g.members[0]?.role ?? null,
  }));
}

export async function getGroup(groupId: string, userId: string) {
  await requireGroupMember(groupId, userId);
  const group = await prismaRead.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        where: { status: "ACTIVE" },
        include: { user: { select: { id: true, email: true, displayName: true } } },
      },
    },
  });
  if (!group) throw new AppError("Không tìm thấy", "NOT_FOUND", 404);
  return {
    id: group.id,
    organizationId: group.organizationId,
    name: group.name,
    settings: group.settings,
    members: group.members.map((m) => ({
      userId: m.userId,
      role: m.role,
      email: m.user.email,
      displayName: m.user.displayName,
    })),
  };
}

export async function addGroupMember(
  groupId: string,
  actorId: string,
  targetUserId: string,
  role: "OWNER" | "ADMIN" | "MEMBER",
) {
  await requireGroupAdmin(groupId, actorId);
  const group = await prismaRead.group.findUnique({ where: { id: groupId } });
  if (!group) throw new AppError("Không tìm thấy", "NOT_FOUND", 404);
  await requireOrgMember(group.organizationId, targetUserId);

  const member = await prismaWrite.$transaction(async (tx) => {
    const m = await tx.groupMember.upsert({
      where: { groupId_userId: { groupId, userId: targetUserId } },
      create: { groupId, userId: targetUserId, role, status: "ACTIVE" },
      update: { role, status: "ACTIVE" },
    });
    const ev = envelope({
      eventType: "GroupMemberAdded",
      aggregateType: "group",
      aggregateId: groupId,
      aggregateVersion: 1,
      actor: { userId: actorId, via: "user" },
      payload: { userId: targetUserId, role },
    });
    await tx.outbox.create({
      data: { topic: TOPICS.groupEvents, payload: ev as unknown as Prisma.InputJsonValue },
    });
    return m;
  });

  void notifyChat("/internal/conversations/ensure-group", {
    groupId,
    memberIds: [targetUserId],
  });

  return { groupId, userId: member.userId, role: member.role, status: member.status };
}

export async function removeGroupMember(groupId: string, actorId: string, targetUserId: string) {
  await requireGroupAdmin(groupId, actorId);

  await prismaWrite.$transaction(async (tx) => {
    const existing = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });
    if (!existing || existing.status !== "ACTIVE") {
      throw new AppError("Không tìm thấy", "NOT_FOUND", 404);
    }
    await tx.groupMember.update({
      where: { groupId_userId: { groupId, userId: targetUserId } },
      data: { status: "REMOVED" },
    });
    await tx.taskAssignee.updateMany({
      where: {
        userId: targetUserId,
        status: "ACTIVE",
        task: { groupId, deletedAt: null },
      },
      data: { status: "REMOVED" },
    });
    const ev = envelope({
      eventType: "GroupMemberRemoved",
      aggregateType: "group",
      aggregateId: groupId,
      aggregateVersion: 1,
      actor: { userId: actorId, via: "user" },
      payload: { userId: targetUserId },
    });
    await tx.outbox.create({
      data: { topic: TOPICS.groupEvents, payload: ev as unknown as Prisma.InputJsonValue },
    });
  });

  void notifyChat("/internal/conversations/remove-member", { groupId, userId: targetUserId });
}

export async function leaveGroup(groupId: string, userId: string) {
  const me = await prismaRead.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!me || me.status !== "ACTIVE") {
    throw new AppError("Không thuộc nhóm", "FORBIDDEN", 403);
  }

  if (me.role === "OWNER") {
    const owners = await prismaRead.groupMember.count({
      where: { groupId, status: "ACTIVE", role: "OWNER" },
    });
    if (owners <= 1) {
      throw new AppError(
        "Owner duy nhất không thể rời nhóm — chuyển quyền owner trước",
        "SOLE_OWNER",
        400,
      );
    }
  }

  await prismaWrite.$transaction(async (tx) => {
    await tx.groupMember.update({
      where: { groupId_userId: { groupId, userId } },
      data: { status: "REMOVED" },
    });
    await tx.taskAssignee.updateMany({
      where: {
        userId,
        status: "ACTIVE",
        task: { groupId, deletedAt: null },
      },
      data: { status: "REMOVED" },
    });
    const ev = envelope({
      eventType: "GroupMemberLeft",
      aggregateType: "group",
      aggregateId: groupId,
      aggregateVersion: 1,
      actor: { userId, via: "user" },
      payload: { userId },
    });
    await tx.outbox.create({
      data: { topic: TOPICS.groupEvents, payload: ev as unknown as Prisma.InputJsonValue },
    });
  });

  void notifyChat("/internal/conversations/remove-member", { groupId, userId });

  const chatResults = await leaveLinkedSpacesViaSync(userId, groupId);
  return { leftGroup: true as const, chatResults };
}

async function leaveLinkedSpacesViaSync(userId: string, groupId: string) {
  const syncUrl = (process.env.GOOGLE_SYNC_URL ?? "http://localhost:3207").replace(/\/$/, "");
  const token = process.env.INTERNAL_SERVICE_TOKEN ?? "dev-internal-token";
  try {
    const res = await fetch(`${syncUrl}/internal/google-chat/leave-linked`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": token,
      },
      body: JSON.stringify({ userId, groupId }),
    });
    if (!res.ok) {
      return [{ spaceName: "*", ok: false, error: await res.text() }];
    }
    const body = (await res.json()) as {
      chatResults?: Array<{ spaceName: string; ok: boolean; error?: string }>;
    };
    return body.chatResults ?? [];
  } catch (err) {
    return [
      {
        spaceName: "*",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
    ];
  }
}
