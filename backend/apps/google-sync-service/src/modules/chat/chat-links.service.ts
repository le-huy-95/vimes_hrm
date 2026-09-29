import { prismaRead, prismaWrite } from "@manage-teams/db";
import { AppError } from "@manage-teams/lib";

export type LinkUpsertInput = {
  spaceName: string;
  groupId: string;
  linkedByUserId: string;
  displayName?: string | null;
  spaceType?: string | null;
};

export function buildLinkUpsertData(input: LinkUpsertInput) {
  return {
    spaceName: input.spaceName,
    groupId: input.groupId,
    linkedByUserId: input.linkedByUserId,
    displayName: input.displayName ?? null,
    spaceType: input.spaceType ?? null,
    status: "ACTIVE" as const,
    chatIngestEnabled: false,
  };
}

export async function requireGroupMember(groupId: string, userId: string) {
  const m = await prismaRead.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!m || m.status !== "ACTIVE") {
    throw new AppError("Không thuộc nhóm", "FORBIDDEN", 403);
  }
  return m;
}

export async function requireGroupAdmin(groupId: string, userId: string) {
  const m = await requireGroupMember(groupId, userId);
  if (m.role !== "OWNER" && m.role !== "ADMIN") {
    throw new AppError("Chỉ admin/owner được liên kết Chat", "FORBIDDEN", 403);
  }
  return m;
}

export async function listLinksForGroup(groupId: string, userId: string) {
  await requireGroupMember(groupId, userId);
  const rows = await prismaRead.googleChatSpace.findMany({
    where: { groupId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    spaceName: r.spaceName,
    groupId: r.groupId!,
    displayName: r.displayName,
    spaceType: r.spaceType,
    linkedByUserId: r.linkedByUserId,
    status: r.status,
  }));
}

export async function createLink(input: {
  groupId: string;
  spaceName: string;
  userId: string;
  displayName?: string;
  spaceType?: string;
}) {
  await requireGroupAdmin(input.groupId, input.userId);

  const existing = await prismaRead.googleChatSpace.findUnique({
    where: { spaceName: input.spaceName },
  });
  if (
    existing &&
    existing.status === "ACTIVE" &&
    existing.groupId &&
    existing.groupId !== input.groupId
  ) {
    throw new AppError(
      "Space đã được liên kết với nhóm khác",
      "CONFLICT",
      409,
    );
  }

  const data = buildLinkUpsertData({
    spaceName: input.spaceName,
    groupId: input.groupId,
    linkedByUserId: input.userId,
    displayName: input.displayName,
    spaceType: input.spaceType,
  });

  const row = await prismaWrite.googleChatSpace.upsert({
    where: { spaceName: input.spaceName },
    create: data,
    update: {
      groupId: data.groupId,
      linkedByUserId: data.linkedByUserId,
      displayName: data.displayName,
      spaceType: data.spaceType,
      status: "ACTIVE",
      chatIngestEnabled: false,
      updatedAt: new Date(),
    },
  });

  return {
    id: row.id,
    spaceName: row.spaceName,
    groupId: row.groupId!,
    displayName: row.displayName,
    spaceType: row.spaceType,
    linkedByUserId: row.linkedByUserId,
    status: row.status,
  };
}

export async function deleteLink(linkId: string, userId: string) {
  const row = await prismaRead.googleChatSpace.findUnique({ where: { id: linkId } });
  if (!row || !row.groupId) {
    throw new AppError("Không tìm thấy liên kết", "NOT_FOUND", 404);
  }
  await requireGroupAdmin(row.groupId, userId);
  await prismaWrite.googleChatSpace.delete({ where: { id: linkId } });
  return { ok: true as const };
}
