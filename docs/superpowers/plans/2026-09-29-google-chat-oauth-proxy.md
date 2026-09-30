# Google Chat OAuth Proxy Implementation Plan

> **HISTORICAL / SUPERSEDED (2026-09-30).** Do **not** execute remaining unchecked boxes. Much of this plan was already implemented in tree. Further work follows [`docs/superpowers/specs/2026-09-30-google-chat-oauth-gap-close-design.md`](../specs/2026-09-30-google-chat-oauth-gap-close-design.md) and a **new** gap-close implementation plan derived from that spec only.

> **For agentic workers (legacy):** REQUIRED SUB-SKILL was subagent-driven-development / executing-plans. Kept for history only.

**Goal:** Make the Chat tab a Google Chat client scoped to spaces linked to the current group, with login Chat+Sheets scopes, create/assign tasks (Google Tasks sync), and self-leave that also leaves linked Chat spaces.

**Architecture:** Flutter calls JWT `/sync/chat/*` on `google-sync-service`, which uses the user’s stored Google refresh token (`getGoogleOAuthForUser`) against Chat API v1. Group↔space links live in `google_chat_spaces`. Task create reuses core `POST /groups/:groupId/tasks`. Leave group is a new core endpoint that then best-effort removes Chat memberships.

**Tech Stack:** Express/TS, Prisma, googleapis Chat v1, Vitest, Flutter Bloc/Dio

**Spec (original):** `docs/superpowers/specs/2026-09-29-google-chat-oauth-proxy-design.md`  
**Superseding spec:** `docs/superpowers/specs/2026-09-30-google-chat-oauth-gap-close-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/packages/db/src/migrations.ts` | `014_google_chat_space_link_meta` |
| `backend/packages/db/prisma/schema.prisma` | `GoogleChatSpace` new fields |
| `backend/apps/google-sync-service/src/infra/google-oauth-client.ts` | `chatClient(auth)` |
| `backend/apps/google-sync-service/src/modules/chat/chat-api.client.ts` | Thin Chat API wrappers (list/send/leave/probe) |
| `backend/apps/google-sync-service/src/modules/chat/chat-readiness.ts` | Classify readiness from probe errors |
| `backend/apps/google-sync-service/src/modules/chat/chat-links.service.ts` | CRUD group↔space links + authz |
| `backend/apps/google-sync-service/src/modules/chat/chat-proxy.service.ts` | List spaces, messages, send, leave-all-for-group |
| `backend/apps/google-sync-service/src/modules/chat/chat-proxy.controller.ts` | JWT handlers |
| `backend/apps/google-sync-service/src/modules/sync/sync.routes.ts` | Mount `/sync/chat/*` + internal leave |
| `backend/apps/google-sync-service/tests/chat-readiness.test.ts` | Readiness classification |
| `backend/apps/google-sync-service/tests/chat-links.test.ts` | Link upsert / authz helpers |
| `backend/apps/core-service/src/modules/group/group.service.ts` | `leaveGroup` |
| `backend/apps/core-service/src/modules/group/group.controller.ts` + `routes.ts` | `POST /groups/:groupId/leave` |
| `frontend/lib/features/auth/data/google_sign_in_helper.dart` | Chat scopes |
| `frontend/lib/features/auth/data/google_web_popup_web.dart` | Passes scopes (already uses list) |
| `frontend/lib/features/home/data/google_chat_repository.dart` | Dio client for `/sync/chat/*` |
| `frontend/lib/features/chat/**` | List/thread/link/create-task/leave UX |
| `frontend/lib/features/home/data/core_repository.dart` | `leaveGroup`, ensure `dueDate` on createTask if missing |

---

### Task 1: DB — link metadata on `google_chat_spaces`

**Files:**
- Modify: `backend/packages/db/src/migrations.ts`
- Modify: `backend/packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add migration `014_google_chat_space_link_meta`**

Append to migrations array (after `013_dm_pair_key`):

```ts
{
  id: "014_google_chat_space_link_meta",
  sql: `
ALTER TABLE google_chat_spaces
  ADD COLUMN IF NOT EXISTS linked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS space_type TEXT;
CREATE INDEX IF NOT EXISTS google_chat_spaces_group_idx
  ON google_chat_spaces (group_id) WHERE group_id IS NOT NULL;
`,
},
```

- [ ] **Step 2: Update Prisma model `GoogleChatSpace`**

```prisma
model GoogleChatSpace {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  spaceName         String   @unique @map("space_name")
  groupId           String?  @map("group_id") @db.Uuid
  conversationId    String?  @map("conversation_id") @db.Uuid
  chatIngestEnabled Boolean  @default(false) @map("chat_ingest_enabled")
  status            String   @default("ACTIVE")
  linkedByUserId    String?  @map("linked_by_user_id") @db.Uuid
  displayName       String?  @map("display_name")
  spaceType         String?  @map("space_type")
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  group        Group?             @relation(fields: [groupId], references: [id], onDelete: SetNull)
  conversation Conversation?      @relation(fields: [conversationId], references: [id], onDelete: SetNull)
  linkedBy     User?              @relation(fields: [linkedByUserId], references: [id], onDelete: SetNull)
  messages     GoogleMessageMap[]
  watch        ChatWatchState?

  @@index([groupId], map: "google_chat_spaces_group_idx")
  @@map("google_chat_spaces")
}
```

Add reverse relation on `User` if required by Prisma (`googleChatSpacesLinked GoogleChatSpace[]`).

- [ ] **Step 3: Migrate + generate**

Run:

```bash
cd backend/packages/db && npm run migrate && npm run prisma:generate
```

Expected: migration `014_google_chat_space_link_meta` applied; client regenerates.

- [ ] **Step 4: Commit**

```bash
git add backend/packages/db/src/migrations.ts backend/packages/db/prisma/schema.prisma
git commit -m "$(cat <<'EOF'
feat(db): google chat space link metadata for group mapping

EOF
)"
```

---

### Task 2: Chat readiness classifier (TDD)

**Files:**
- Create: `backend/apps/google-sync-service/src/modules/chat/chat-readiness.ts`
- Create: `backend/apps/google-sync-service/tests/chat-readiness.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { classifyChatProbeError, type ChatReadiness } from "../src/modules/chat/chat-readiness.js";

describe("classifyChatProbeError", () => {
  it("maps missing refresh / AUTH_REQUIRED to needs_reconsent", () => {
    expect(classifyChatProbeError({ code: "AUTH_REQUIRED", message: "no token" })).toEqual({
      status: "needs_reconsent",
      reason: "AUTH_REQUIRED",
    } satisfies ChatReadiness);
  });

  it("maps 403 chat disabled / not a chat user to chat_disabled", () => {
    expect(
      classifyChatProbeError({
        httpStatus: 403,
        message: "Google Chat is not enabled for the user",
      }),
    ).toMatchObject({ status: "chat_disabled" });
  });

  it("maps insufficient scopes to needs_reconsent", () => {
    expect(
      classifyChatProbeError({
        httpStatus: 403,
        message: "Request had insufficient authentication scopes",
      }),
    ).toMatchObject({ status: "needs_reconsent" });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend/apps/google-sync-service && npx vitest run tests/chat-readiness.test.ts
```

Expected: FAIL module not found / export missing.

- [ ] **Step 3: Implement classifier**

```ts
export type ChatReadiness =
  | { status: "ready" }
  | { status: "needs_reconsent"; reason: string }
  | { status: "chat_disabled"; reason: string }
  | { status: "error"; reason: string };

export function classifyChatProbeError(input: {
  code?: string;
  httpStatus?: number;
  message: string;
}): ChatReadiness {
  const msg = input.message.toLowerCase();
  if (input.code === "AUTH_REQUIRED" || msg.includes("invalid_grant")) {
    return { status: "needs_reconsent", reason: input.code ?? "AUTH_REQUIRED" };
  }
  if (msg.includes("insufficient") && msg.includes("scope")) {
    return { status: "needs_reconsent", reason: "INSUFFICIENT_SCOPES" };
  }
  if (
    msg.includes("chat is not enabled") ||
    msg.includes("not a chat user") ||
    msg.includes("google chat app")
  ) {
    return { status: "chat_disabled", reason: input.message };
  }
  if (input.httpStatus === 403 || input.httpStatus === 404) {
    return { status: "chat_disabled", reason: input.message };
  }
  return { status: "error", reason: input.message };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd backend/apps/google-sync-service && npx vitest run tests/chat-readiness.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add backend/apps/google-sync-service/src/modules/chat/chat-readiness.ts backend/apps/google-sync-service/tests/chat-readiness.test.ts
git commit -m "$(cat <<'EOF'
feat(google-sync): classify Google Chat readiness from probe errors

EOF
)"
```

---

### Task 3: Chat API client + OAuth helper

**Files:**
- Modify: `backend/apps/google-sync-service/src/infra/google-oauth-client.ts`
- Create: `backend/apps/google-sync-service/src/modules/chat/chat-api.client.ts`

- [ ] **Step 1: Add `chatClient` export**

In `google-oauth-client.ts`:

```ts
export function chatClient(auth: GoogleOAuth2) {
  return google.chat({ version: "v1", auth });
}
```

- [ ] **Step 2: Implement `chat-api.client.ts`**

```ts
import { AppError } from "@manage-teams/lib";
import { chatClient, getGoogleOAuthForUser } from "../../infra/google-oauth-client.js";

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

/** spaceName like spaces/XXX; member name spaces/XXX/members/USER_KEY */
export async function leaveSpaceAsUser(userId: string, spaceName: string) {
  const chat = await withChatApi(userId);
  const me = await chat.spaces.members.get({
    name: `${spaceName}/members/users/me`,
  }).catch(() => null);
  const memberName = me?.data?.name;
  if (!memberName) {
    throw new AppError("Không tìm thấy membership Google Chat", "NOT_FOUND", 404);
  }
  await chat.spaces.members.delete({ name: memberName });
}
```

If `users/me` is unsupported in the installed `googleapis` types, resolve membership via `spaces.members.list` and match the caller’s Google user resource — keep resolution inside this file only.

- [ ] **Step 3: Smoke-compile**

```bash
cd backend/apps/google-sync-service && npx tsc --noEmit
```

Expected: no errors (or only pre-existing unrelated).

- [ ] **Step 4: Commit**

```bash
git add backend/apps/google-sync-service/src/infra/google-oauth-client.ts backend/apps/google-sync-service/src/modules/chat/chat-api.client.ts
git commit -m "$(cat <<'EOF'
feat(google-sync): Google Chat API client via user OAuth

EOF
)"
```

---

### Task 4: Links service + tests

**Files:**
- Create: `backend/apps/google-sync-service/src/modules/chat/chat-links.service.ts`
- Create: `backend/apps/google-sync-service/tests/chat-links.test.ts`

Use Prisma for membership checks (same DB as core):

```ts
async function requireGroupMember(groupId: string, userId: string) {
  const m = await prismaRead.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!m || m.status !== "ACTIVE") {
    throw new AppError("Không thuộc nhóm", "FORBIDDEN", 403);
  }
  return m;
}

async function requireGroupAdmin(groupId: string, userId: string) {
  const m = await requireGroupMember(groupId, userId);
  if (m.role !== "OWNER" && m.role !== "ADMIN") {
    throw new AppError("Chỉ admin/owner được liên kết Chat", "FORBIDDEN", 403);
  }
  return m;
}
```

- [ ] **Step 1: Failing unit test for upsert uniqueness by `spaceName`**

```ts
import { describe, expect, it } from "vitest";
import { buildLinkUpsertData } from "../src/modules/chat/chat-links.service.js";

describe("buildLinkUpsertData", () => {
  it("maps fields for upsert", () => {
    expect(
      buildLinkUpsertData({
        spaceName: "spaces/AAA",
        groupId: "11111111-1111-1111-1111-111111111111",
        linkedByUserId: "22222222-2222-2222-2222-222222222222",
        displayName: "Team",
        spaceType: "SPACE",
      }),
    ).toEqual({
      spaceName: "spaces/AAA",
      groupId: "11111111-1111-1111-1111-111111111111",
      linkedByUserId: "22222222-2222-2222-2222-222222222222",
      displayName: "Team",
      spaceType: "SPACE",
      status: "ACTIVE",
      chatIngestEnabled: false,
    });
  });
});
```

- [ ] **Step 2: Implement `chat-links.service.ts`**

Export:

- `buildLinkUpsertData(...)` (pure, for test)
- `listLinksForGroup(groupId, userId)` — member
- `createLink({ groupId, spaceName, userId, displayName?, spaceType? })` — admin; upsert on `spaceName`; if space already linked to **another** group → `409 CONFLICT`
- `deleteLink(linkId, userId)` — admin of that link’s group; sets `groupId` null + `status=UNLINKED` **or** deletes row (prefer delete row for simplicity)

- [ ] **Step 3: Run vitest for `chat-links.test.ts` — PASS**

- [ ] **Step 4: Commit**

```bash
git add backend/apps/google-sync-service/src/modules/chat/chat-links.service.ts backend/apps/google-sync-service/tests/chat-links.test.ts
git commit -m "$(cat <<'EOF'
feat(google-sync): group↔Google Chat space link service

EOF
)"
```

---

### Task 5: Proxy service + JWT routes

**Files:**
- Create: `backend/apps/google-sync-service/src/modules/chat/chat-proxy.service.ts`
- Create: `backend/apps/google-sync-service/src/modules/chat/chat-proxy.controller.ts`
- Modify: `backend/apps/google-sync-service/src/modules/sync/sync.routes.ts`

- [ ] **Step 1: `chat-proxy.service.ts`**

```ts
export async function getReadiness(userId: string) {
  try {
    await probeChatAccess(userId);
    return { status: "ready" as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = err instanceof AppError ? err.code : undefined;
    const httpStatus = err instanceof AppError ? err.status : undefined;
    return classifyChatProbeError({ code, httpStatus, message });
  }
}

export async function listSpaces(userId: string) {
  const readiness = await getReadiness(userId);
  if (readiness.status !== "ready") return { readiness, spaces: [] as const };
  return { readiness, spaces: await listUserSpaces(userId) };
}

export async function listMessages(userId: string, groupId: string, spaceName: string, pageToken?: string) {
  await assertSpaceLinkedToGroup(groupId, spaceName, userId); // member check inside
  return listSpaceMessages(userId, spaceName, pageToken);
}

export async function sendMessage(userId: string, groupId: string, spaceName: string, text: string) {
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
```

Implement `assertSpaceLinkedToGroup` using `requireGroupMember` + find link where `groupId` + `spaceName` + `status=ACTIVE`.

- [ ] **Step 2: Controller + Zod**

```ts
// readiness
export async function readiness(req, res) {
  const user = await requireUser(req);
  res.json(await getReadiness(user.id));
}

// GET /sync/chat/spaces
// GET /sync/chat/links?groupId=
// POST /sync/chat/links { groupId, spaceName, displayName?, spaceType? }
// DELETE /sync/chat/links/:id
// GET /sync/chat/spaces/:spaceName/messages?groupId=&pageToken=
// POST /sync/chat/spaces/:spaceName/messages { groupId, text }
// POST /internal/google-chat/leave-linked { userId, groupId }  (x-internal-token)
```

URL-encode `spaceName` (`spaces%2FXXX`) in route params; decode with `decodeURIComponent`.

- [ ] **Step 3: Register routes in `sync.routes.ts`**

```ts
import * as chatProxyController from "../chat/chat-proxy.controller.js";

syncRoutes.get("/sync/chat/readiness", (req, res) => void chatProxyController.readiness(req, res));
syncRoutes.get("/sync/chat/spaces", (req, res) => void chatProxyController.listSpaces(req, res));
syncRoutes.get("/sync/chat/links", (req, res) => void chatProxyController.listLinks(req, res));
syncRoutes.post("/sync/chat/links", (req, res) => void chatProxyController.createLink(req, res));
syncRoutes.delete("/sync/chat/links/:id", (req, res) => void chatProxyController.deleteLink(req, res));
syncRoutes.get("/sync/chat/spaces/:spaceName/messages", (req, res) =>
  void chatProxyController.listMessages(req, res),
);
syncRoutes.post("/sync/chat/spaces/:spaceName/messages", (req, res) =>
  void chatProxyController.sendMessage(req, res),
);
syncRoutes.post("/internal/google-chat/leave-linked", (req, res) =>
  void chatProxyController.leaveLinkedInternal(req, res),
);
```

Gateway already proxies `/sync` — no gateway change required.

- [ ] **Step 4: Manual curl smoke (dev)**

With a JWT that has Chat scopes:

```bash
curl -s -H "Authorization: Bearer $JWT" http://localhost:3000/sync/chat/readiness
```

Expected JSON `{ "status": "ready" }` or `needs_reconsent` / `chat_disabled`.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/google-sync-service/src/modules/chat/chat-proxy.service.ts \
  backend/apps/google-sync-service/src/modules/chat/chat-proxy.controller.ts \
  backend/apps/google-sync-service/src/modules/sync/sync.routes.ts
git commit -m "$(cat <<'EOF'
feat(google-sync): JWT Google Chat proxy routes for spaces links and messages

EOF
)"
```

---

### Task 6: Core `POST /groups/:groupId/leave`

**Files:**
- Modify: `backend/apps/core-service/src/modules/group/group.service.ts`
- Modify: `backend/apps/core-service/src/modules/group/group.controller.ts`
- Modify: `backend/apps/core-service/src/modules/group/group.routes.ts`

- [ ] **Step 1: Implement `leaveGroup(groupId, userId)`**

```ts
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
```

- [ ] **Step 2: Controller + route**

```ts
// group.routes.ts
groupRoutes.post("/groups/:groupId/leave", groupController.leaveGroup);

// controller
export async function leaveGroup(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const groupId = req.params.groupId as string;
    res.json(await groupService.leaveGroup(groupId, user.id));
  } catch (err) {
    sendError(res, err, logger);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/apps/core-service/src/modules/group/
git commit -m "$(cat <<'EOF'
feat(core): self-leave group and best-effort Google Chat space leave

EOF
)"
```

---

### Task 7: Flutter — Chat OAuth scopes

**Files:**
- Modify: `frontend/lib/features/auth/data/google_sign_in_helper.dart`

- [ ] **Step 1: Extend `kGoogleSyncScopes`**

```dart
const kGoogleSyncScopes = <String>[
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.messages',
  'https://www.googleapis.com/auth/chat.memberships',
];
```

Web popup already spreads `scopes` — no change unless default scope list is duplicated elsewhere; grep and update duplicates.

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/features/auth/data/google_sign_in_helper.dart
git commit -m "$(cat <<'EOF'
feat(flutter): request Google Chat scopes on sign-in

EOF
)"
```

---

### Task 8: Flutter — `GoogleChatRepository`

**Files:**
- Create: `frontend/lib/features/home/data/google_chat_repository.dart`
- Modify: `frontend/lib/features/home/data/core_repository.dart` — add `leaveGroup`, pass `dueDate` on `createTask` if not already present

- [ ] **Step 1: Models + repository**

```dart
class ChatReadiness {
  const ChatReadiness({required this.status, this.reason});
  final String status; // ready | needs_reconsent | chat_disabled | error
  final String? reason;
  factory ChatReadiness.fromJson(Map<String, dynamic> j) => ChatReadiness(
        status: j['status'] as String? ?? 'error',
        reason: j['reason'] as String?,
      );
  bool get isReady => status == 'ready';
}

class GoogleChatSpaceItem {
  const GoogleChatSpaceItem({
    required this.name,
    required this.displayName,
    required this.spaceType,
  });
  final String name;
  final String displayName;
  final String spaceType;
}

class GoogleChatLink {
  const GoogleChatLink({
    required this.id,
    required this.spaceName,
    required this.groupId,
    this.displayName,
    this.spaceType,
  });
  final String id;
  final String spaceName;
  final String groupId;
  final String? displayName;
  final String? spaceType;
}

class GoogleChatMessage {
  const GoogleChatMessage({
    required this.name,
    required this.text,
    required this.sender,
    this.createTime,
  });
  final String name;
  final String text;
  final String sender;
  final DateTime? createTime;
}

class GoogleChatRepository {
  GoogleChatRepository(this._api);
  final ApiClient _api;

  Future<ChatReadiness> readiness() async { /* GET /sync/chat/readiness */ }

  Future<List<GoogleChatSpaceItem>> listSpaces() async { /* GET /sync/chat/spaces */ }

  Future<List<GoogleChatLink>> listLinks(String groupId) async { /* GET /sync/chat/links?groupId= */ }

  Future<GoogleChatLink> createLink({
    required String groupId,
    required String spaceName,
    String? displayName,
    String? spaceType,
  }) async { /* POST /sync/chat/links */ }

  Future<void> deleteLink(String id) async { /* DELETE /sync/chat/links/:id */ }

  Future<({List<GoogleChatMessage> messages, String? nextPageToken})> listMessages({
    required String groupId,
    required String spaceName,
    String? pageToken,
  }) async {
    final encoded = Uri.encodeComponent(spaceName);
    // GET /sync/chat/spaces/$encoded/messages?groupId=
  }

  Future<void> sendMessage({
    required String groupId,
    required String spaceName,
    required String text,
  }) async {
    final encoded = Uri.encodeComponent(spaceName);
    // POST .../messages { groupId, text }
  }
}
```

- [ ] **Step 2: `CoreRepository.leaveGroup`**

```dart
Future<({bool leftGroup, List<Map<String, dynamic>> chatResults})> leaveGroup(
  String groupId,
) async {
  final res = await _api.dio.post<Map<String, dynamic>>('/groups/$groupId/leave');
  final data = res.data ?? {};
  return (
    leftGroup: data['leftGroup'] == true,
    chatResults: (data['chatResults'] as List<dynamic>? ?? [])
        .cast<Map<String, dynamic>>(),
  );
}
```

If `createTask` lacks `dueDate`, add optional `String? dueDate` to the POST body (YYYY-MM-DD).

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/features/home/data/google_chat_repository.dart frontend/lib/features/home/data/core_repository.dart
git commit -m "$(cat <<'EOF'
feat(flutter): Google Chat API repository and leaveGroup client

EOF
)"
```

---

### Task 9: Flutter Chat list — readiness, links, picker

**Files:**
- Modify: `frontend/lib/features/chat/bloc/chat_list_*.dart`
- Modify: `frontend/lib/features/chat/pages/chat_tab_page.dart`
- Wire `GoogleChatRepository` in router/`app_shell` providers (same pattern as `ChatRepository`)

- [ ] **Step 1: Redesign list state**

Replace dependence on internal `listConversations()` for the main group list with:

- `readiness`
- `links` for current `groupId`
- `myRole` from group (for CTA vs wait message)
- `linking` busy flag

Keep selecting a link → open thread by `spaceName` (not conversation id).

- [ ] **Step 2: Empty + CTA**

- Admin/Owner + no links → button “Liên kết Google Chat” → sheet listing `listSpaces()`, multi-select or single-select then `createLink`.
- Member + no links → text “Chờ admin liên kết Google Chat”.
- `needs_reconsent` → button re-trigger Google sign-in.
- `chat_disabled` → blocking copy + “Mở Google Chat” (`https://chat.google.com`) + Retry.

- [ ] **Step 3: Manual UI check on Chrome**

Run `./tool/run_chrome.sh` (or existing flutter chrome target). Expected: empty CTA or linked list for selected group.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/features/chat/ frontend/lib/app/
git commit -m "$(cat <<'EOF'
feat(flutter): Chat tab lists Google Chat spaces linked to group

EOF
)"
```

---

### Task 10: Flutter Chat thread — messages, send, poll

**Files:**
- Modify: `frontend/lib/features/chat/bloc/chat_thread_*.dart`
- Thread page widgets under `frontend/lib/features/chat/`

- [ ] **Step 1: Open thread by `groupId` + `spaceName`**

Load `listMessages`; display sender/text/time. Composer calls `sendMessage`. Poll every 10s while thread visible (`Timer.periodic`); cancel on close.

- [ ] **Step 2: Remove Socket.IO join/leave for this path** (or no-op when using Google Chat mode) so missing chat-service does not break UX.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/features/chat/
git commit -m "$(cat <<'EOF'
feat(flutter): Google Chat thread read/send with polling

EOF
)"
```

---

### Task 11: Create / assign task from Chat + announce

**Files:**
- Modify: chat thread UI + bloc
- Reuse: `CoreRepository.createTask`

- [ ] **Step 1: “Thêm công việc” action**

Sheet fields:

- Title (required)
- Due date (optional date picker → `yyyy-MM-dd`)
- Multi-select assignees from `CoreRepository.getGroup(groupId).members`

Submit:

```dart
final task = await _core.createTask(
  groupId,
  title: title,
  assigneeIds: selectedIds,
  dueDate: due, // if added in Task 8
);
try {
  await _googleChat.sendMessage(
    groupId: groupId,
    spaceName: spaceName,
    text: 'Đã tạo ${task.code}: ${task.title}',
  );
} catch (_) {
  // soft warning snackbar — task already created
}
```

- [ ] **Step 2: Manual check**

Create task with assignee who has Google linked → appears in Tasks tab and Google Tasks (existing push). Announce message appears in space (or soft warning).

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/features/chat/ frontend/lib/features/home/data/core_repository.dart
git commit -m "$(cat <<'EOF'
feat(flutter): create assigned task from Google Chat thread

EOF
)"
```

---

### Task 12: Leave group UI

**Files:**
- Group/workspace settings or chat/group header (prefer existing group detail / workspace switcher overflow)
- Call `CoreRepository.leaveGroup`

- [ ] **Step 1: Add “Rời nhóm” for non-sole-owner**

On success: show snackbar; if any `chatResults` with `ok: false`, list residual space names; navigate away from group.

On `SOLE_OWNER` 400: dialog explaining transfer ownership first.

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/features/
git commit -m "$(cat <<'EOF'
feat(flutter): self-leave group with Google Chat leave feedback

EOF
)"
```

---

### Task 13: Spec status + short runbook note

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-google-chat-oauth-proxy-design.md` status → `Implemented` only after verification
- Create or append: `backend/docs/runbooks/google-chat-oauth-proxy.md` with env, scopes, re-consent, curl examples

- [ ] **Step 1: Write runbook** (scopes list, readiness states, leave flow)
- [ ] **Step 2: Commit docs**

```bash
git add docs/ backend/docs/runbooks/google-chat-oauth-proxy.md
git commit -m "$(cat <<'EOF'
docs: Google Chat OAuth proxy runbook

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Chat scopes at login | 7 |
| Readiness gate / reconsent / chat_disabled | 2, 5, 9 |
| List user spaces + link CRUD (admin) | 4, 5, 9 |
| Messages list/send + group link authz | 3, 5, 10 |
| Create task + Google Tasks + announce | 11 (core create existing) |
| Self-leave + Chat leave best-effort | 6, 12 |
| Sheets unchanged (same consent) | 7 (scopes keep sheets) |
| DB link metadata | 1 |
| No internal chat as UX source | 9–10 |

## Self-review notes

- No TBD placeholders; Chat membership `users/me` has an explicit fallback note in Task 3.
- Types: `spaceName`, `groupId`, readiness `status` strings consistent across backend/Flutter tasks.
- Kick-member + Chat leave deferred as secondary (spec: self-leave primary); not blocking MVP.
