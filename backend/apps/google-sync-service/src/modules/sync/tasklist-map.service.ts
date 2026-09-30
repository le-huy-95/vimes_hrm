import { google } from "googleapis";
import { prismaRead, prismaWrite, Prisma } from "@manage-teams/db";
import { AppError } from "@manage-teams/lib";
import {
  getCachedAccessToken,
  setCachedAccessToken,
} from "../../infra/oauth-token-cache.js";
import { decryptSecret } from "../../infra/secret-box.js";

export function pickUnmappedGroupIds(
  membershipGroupIds: string[],
  mappedGroupIds: string[],
): string[] {
  const mapped = new Set(mappedGroupIds);
  return membershipGroupIds.filter((id) => !mapped.has(id));
}

async function assertActiveMember(userId: string, groupId: string): Promise<void> {
  const member = await prismaRead.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!member || member.status !== "ACTIVE") {
    throw new AppError("Không phải thành viên ACTIVE của nhóm", "FORBIDDEN", 403);
  }
}

export async function getMapForGroup(userId: string, groupId: string) {
  return prismaRead.userGroupTasklistMap.findUnique({
    where: { userId_groupId: { userId, groupId } },
  });
}

export async function resolveTasklistIdForPush(
  userId: string,
  groupId: string,
): Promise<string | null> {
  const map = await getMapForGroup(userId, groupId);
  return map?.googleTasklistId ?? null;
}

export async function listMapsForUser(userId: string) {
  const [memberships, maps] = await Promise.all([
    prismaRead.groupMember.findMany({
      where: { userId, status: "ACTIVE" },
      include: { group: { select: { id: true, name: true } } },
    }),
    prismaRead.userGroupTasklistMap.findMany({ where: { userId } }),
  ]);
  const mapByGroup = new Map(maps.map((m) => [m.groupId, m]));
  const groups = memberships.map((m) => {
    const map = mapByGroup.get(m.groupId);
    return {
      groupId: m.groupId,
      groupName: m.group.name,
      googleTasklistId: map?.googleTasklistId ?? null,
      googleTasklistTitle: map?.googleTasklistTitle ?? null,
      mapped: Boolean(map),
    };
  });
  const unmappedGroupIds = pickUnmappedGroupIds(
    groups.map((g) => g.groupId),
    maps.map((m) => m.groupId),
  );
  return { groups, unmappedGroupIds };
}

export async function upsertMap(
  userId: string,
  groupId: string,
  googleTasklistId: string,
  googleTasklistTitle?: string,
) {
  await assertActiveMember(userId, groupId);
  try {
    return await prismaWrite.userGroupTasklistMap.upsert({
      where: { userId_groupId: { userId, groupId } },
      create: {
        userId,
        groupId,
        googleTasklistId,
        googleTasklistTitle: googleTasklistTitle ?? null,
      },
      update: {
        googleTasklistId,
        ...(googleTasklistTitle !== undefined
          ? { googleTasklistTitle }
          : {}),
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new AppError(
        "Task list đã gắn với nhóm khác",
        "TASKLIST_IN_USE",
        409,
      );
    }
    throw err;
  }
}

export async function deleteMap(userId: string, groupId: string) {
  const existing = await prismaRead.userGroupTasklistMap.findUnique({
    where: { userId_groupId: { userId, groupId } },
  });
  if (!existing) {
    throw new AppError("Map không tồn tại", "NOT_FOUND", 404);
  }
  await prismaWrite.userGroupTasklistMap.delete({
    where: { userId_groupId: { userId, groupId } },
  });
  return { deleted: true };
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

export async function listGoogleTasklists(userId: string) {
  const account = await prismaRead.userGoogleAccount.findFirst({
    where: { userId, isPrimary: true },
  });
  if (!account?.refreshTokenEnc) {
    throw new AppError("User chưa liên kết Google", "AUTH_REQUIRED", 401);
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new AppError("GOOGLE_CLIENT_ID/SECRET chưa cấu hình", "CONFIG_MISSING", 500);
  }
  const refreshToken = decryptSecret(account.refreshTokenEnc);
  const tasksApi = await getTasksClient(userId, clientId, clientSecret, refreshToken);
  const listed = await tasksApi.tasklists.list({ maxResults: 100 });
  return (listed.data.items ?? [])
    .filter((i) => i.id)
    .map((i) => ({ id: i.id!, title: i.title ?? i.id! }));
}
