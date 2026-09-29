import { prismaRead } from "@manage-teams/db";
import { AppError } from "@manage-teams/lib";
import {
  leaveSpaceAsUser,
  listSpaceMessages,
  listUserSpaces,
  probeChatAccess,
  sendSpaceMessage,
} from "./chat-api.client.js";
import { classifyChatProbeError } from "./chat-readiness.js";
import { requireGroupMember } from "./chat-links.service.js";

export async function getReadiness(userId: string) {
  try {
    await probeChatAccess(userId);
    return { status: "ready" as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = err instanceof AppError ? err.code : undefined;
    const httpStatus = err instanceof AppError ? err.statusCode : undefined;
    return classifyChatProbeError({ code, httpStatus, message });
  }
}

export async function listSpaces(userId: string) {
  const readiness = await getReadiness(userId);
  if (readiness.status !== "ready") {
    return { readiness, spaces: [] as const };
  }
  return { readiness, spaces: await listUserSpaces(userId) };
}

async function assertSpaceLinkedToGroup(
  groupId: string,
  spaceName: string,
  userId: string,
) {
  await requireGroupMember(groupId, userId);
  const link = await prismaRead.googleChatSpace.findFirst({
    where: { groupId, spaceName, status: "ACTIVE" },
  });
  if (!link) {
    throw new AppError(
      "Space chưa được liên kết với nhóm này",
      "NOT_LINKED",
      403,
    );
  }
  return link;
}

export async function listMessages(
  userId: string,
  groupId: string,
  spaceName: string,
  pageToken?: string,
) {
  await assertSpaceLinkedToGroup(groupId, spaceName, userId);
  return listSpaceMessages(userId, spaceName, pageToken);
}

export async function sendMessage(
  userId: string,
  groupId: string,
  spaceName: string,
  text: string,
) {
  await assertSpaceLinkedToGroup(groupId, spaceName, userId);
  return sendSpaceMessage(userId, spaceName, text);
}

export async function leaveLinkedSpaces(userId: string, groupId: string) {
  const links = await prismaRead.googleChatSpace.findMany({
    where: { groupId, status: "ACTIVE" },
  });
  const chatResults: Array<{ spaceName: string; ok: boolean; error?: string }> = [];
  for (const link of links) {
    try {
      await leaveSpaceAsUser(userId, link.spaceName);
      chatResults.push({ spaceName: link.spaceName, ok: true });
    } catch (err) {
      chatResults.push({
        spaceName: link.spaceName,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { chatResults };
}
