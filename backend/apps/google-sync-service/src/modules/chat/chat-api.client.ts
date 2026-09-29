import { AppError } from "@manage-teams/lib";
import {
  chatClient,
  getGoogleOAuthForUser,
} from "../../infra/google-oauth-client.js";

export async function withChatApi(userId: string) {
  const { oauth2 } = await getGoogleOAuthForUser(userId);
  return chatClient(oauth2);
}

export async function probeChatAccess(userId: string): Promise<void> {
  const chat = await withChatApi(userId);
  await chat.spaces.list({ pageSize: 1 });
}

export async function listUserSpaces(userId: string) {
  const chat = await withChatApi(userId);
  const spaces: Array<{
    name: string;
    displayName: string;
    spaceType: string;
  }> = [];
  let pageToken: string | undefined;
  do {
    const res = await chat.spaces.list({ pageSize: 100, pageToken });
    for (const s of res.data.spaces ?? []) {
      if (!s.name) continue;
      spaces.push({
        name: s.name,
        displayName: s.displayName ?? s.name,
        spaceType: s.spaceType ?? "SPACE",
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return spaces;
}

export async function listSpaceMessages(
  userId: string,
  spaceName: string,
  pageToken?: string,
) {
  const chat = await withChatApi(userId);
  const res = await chat.spaces.messages.list({
    parent: spaceName,
    pageSize: 50,
    pageToken,
    orderBy: "createTime desc",
  });
  return {
    messages: (res.data.messages ?? []).map((m) => ({
      name: m.name ?? "",
      text: m.text ?? m.formattedText ?? "",
      sender: m.sender?.displayName ?? m.sender?.name ?? "",
      createTime: m.createTime ?? null,
    })),
    nextPageToken: res.data.nextPageToken ?? null,
  };
}

export async function sendSpaceMessage(
  userId: string,
  spaceName: string,
  text: string,
) {
  const chat = await withChatApi(userId);
  const res = await chat.spaces.messages.create({
    parent: spaceName,
    requestBody: { text },
  });
  return { name: res.data.name ?? "", text: res.data.text ?? text };
}

/** Leave the calling user from a space (best-effort membership resolve). */
export async function leaveSpaceAsUser(userId: string, spaceName: string) {
  const chat = await withChatApi(userId);

  try {
    const me = await chat.spaces.members.get({
      name: `${spaceName}/members/users/me`,
    });
    if (me.data?.name) {
      await chat.spaces.members.delete({ name: me.data.name });
      return;
    }
  } catch {
    // Fall through to list-based resolve.
  }

  const listed = await chat.spaces.members.list({ parent: spaceName, pageSize: 100 });
  const self = (listed.data.memberships ?? []).find((m) => {
    const state = (m.state ?? "").toUpperCase();
    if (state && state !== "JOINED") return false;
    const memberName = m.member?.name ?? m.name ?? "";
    return memberName.includes("/users/me") || Boolean(m.member?.name);
  });

  // Prefer membership where member.name matches users/me pattern; else first human JOINED with name.
  const candidate =
    (listed.data.memberships ?? []).find((m) =>
      (m.member?.name ?? "").endsWith("/users/me") || (m.name ?? "").includes("/members/users/me"),
    ) ??
    (listed.data.memberships ?? []).find(
      (m) => (m.state ?? "JOINED").toUpperCase() === "JOINED" && m.name,
    ) ??
    self;

  const memberName = candidate?.name;
  if (!memberName) {
    throw new AppError("Không tìm thấy membership Google Chat", "NOT_FOUND", 404);
  }
  await chat.spaces.members.delete({ name: memberName });
}
