# Multi Google Tasklists (Step D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each user map one Google Task list per app group; skip push/pull when unmapped; configure on Sync tab; warn with a Tasks banner.

**Architecture:** New `user_group_tasklist_maps` table; google-sync-service CRUD + list Google tasklists; push/pull resolve list ids from maps only (no `"Manage Teams"` fallback); Flutter Sync mapping UI + Tasks deep-link banner to `/sync`.

**Tech Stack:** Prisma/Postgres migrations, Bun + Express (google-sync-service), Flutter + bloc, Google Tasks API.

**Spec:** `docs/superpowers/specs/2026-09-30-multi-google-tasklists-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/packages/db/src/migrations.ts` | Migration `017_user_group_tasklist_maps` |
| `backend/packages/db/prisma/schema.prisma` | `UserGroupTasklistMap` model + User/Group relations |
| `backend/apps/google-sync-service/src/modules/sync/tasklist-map.service.ts` | Resolve map, list maps, upsert, delete, list Google lists |
| `backend/apps/google-sync-service/src/modules/sync/sync.controller.ts` | HTTP handlers for map APIs |
| `backend/apps/google-sync-service/src/modules/sync/sync.routes.ts` | Wire routes |
| `backend/apps/google-sync-service/src/modules/sync/sync.service.ts` | Extend `getSyncStatus` with `unmappedGroupIds` |
| `backend/apps/google-sync-service/src/modules/sync/tasks-push.handler.ts` | Use mapped list id; skip if no map |
| `backend/apps/google-sync-service/src/modules/sync/tasks-pull.handler.ts` | Pull only mapped lists; import into mapped `groupId` |
| `backend/apps/google-sync-service/tests/tasklist-map.test.ts` | Unit tests for resolve / uniqueness helpers |
| `frontend/lib/core/models/api_models.dart` | DTOs + `unmappedGroupIds` on `SyncStatus` |
| `frontend/lib/features/home/data/sync_repository.dart` | Map API client methods |
| `frontend/lib/features/sync/bloc/*` | Load/set/clear maps |
| `frontend/lib/features/sync/pages/sync_tab_page.dart` | Mapping section UI |
| `frontend/lib/features/tasks/pages/tasks_tab_page.dart` | Unmapped banner → `context.go('/sync')` |

---

### Task 1: Migration + Prisma model

**Files:**
- Modify: `backend/packages/db/src/migrations.ts`
- Modify: `backend/packages/db/prisma/schema.prisma`

- [ ] **Step 1: Append migration `017_user_group_tasklist_maps`**

After the `016_task_starred` entry in `migrations.ts`, add:

```ts
  {
    id: "017_user_group_tasklist_maps",
    sql: `
CREATE TABLE IF NOT EXISTS user_group_tasklist_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  google_tasklist_id TEXT NOT NULL,
  google_tasklist_title TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  UNIQUE (user_id, group_id),
  UNIQUE (user_id, google_tasklist_id)
);
CREATE INDEX IF NOT EXISTS user_group_tasklist_maps_user_idx
  ON user_group_tasklist_maps (user_id);
`,
  },
```

- [ ] **Step 2: Add Prisma model**

In `schema.prisma`, on `User` add:

```prisma
  tasklistMaps   UserGroupTasklistMap[]
```

On `Group` add:

```prisma
  tasklistMaps   UserGroupTasklistMap[]
```

Add model:

```prisma
/** User gắn 1 Google Task list ↔ 1 group (sync Tasks). */
model UserGroupTasklistMap {
  id                   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId               String   @map("user_id") @db.Uuid
  groupId              String   @map("group_id") @db.Uuid
  googleTasklistId     String   @map("google_tasklist_id")
  googleTasklistTitle  String?  @map("google_tasklist_title")
  createdAt            DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  group Group @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@unique([userId, groupId])
  @@unique([userId, googleTasklistId])
  @@index([userId])
  @@map("user_group_tasklist_maps")
}
```

- [ ] **Step 3: Generate client + migrate**

```bash
cd backend/packages/db && bun run prisma generate && bun run migrate
```

Expected: `applied 017_user_group_tasklist_maps` (or `skip` if already applied).

- [ ] **Step 4: Commit**

```bash
git add backend/packages/db/src/migrations.ts backend/packages/db/prisma/schema.prisma
git commit -m "db: add user_group_tasklist_maps for multi Google lists"
```

---

### Task 2: Map service + unit tests

**Files:**
- Create: `backend/apps/google-sync-service/src/modules/sync/tasklist-map.service.ts`
- Create: `backend/apps/google-sync-service/tests/tasklist-map.test.ts`

- [ ] **Step 1: Write failing tests for pure helpers**

Create `tests/tasklist-map.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { pickUnmappedGroupIds } from "../src/modules/sync/tasklist-map.service.js";

describe("pickUnmappedGroupIds", () => {
  test("returns membership groups without a map", () => {
    const membershipGroupIds = ["g1", "g2", "g3"];
    const mappedGroupIds = ["g2"];
    expect(pickUnmappedGroupIds(membershipGroupIds, mappedGroupIds).sort()).toEqual([
      "g1",
      "g3",
    ]);
  });

  test("returns empty when all mapped", () => {
    expect(pickUnmappedGroupIds(["g1"], ["g1"])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module/export missing)**

```bash
cd backend/apps/google-sync-service && bun test tests/tasklist-map.test.ts
```

Expected: fail resolving export / file.

- [ ] **Step 3: Implement `tasklist-map.service.ts`**

```ts
import { AppError } from "@manage-teams/lib";
import { prismaRead, prismaWrite, Prisma } from "@manage-teams/db";
import { google } from "googleapis";
import {
  clearCachedAccessToken,
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

export async function getMapForGroup(userId: string, groupId: string) {
  return prismaRead.userGroupTasklistMap.findUnique({
    where: { userId_groupId: { userId, groupId } },
  });
}

/** null = chưa map — caller skip push. */
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
  googleTasklistTitle?: string | null,
) {
  const member = await prismaRead.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!member || member.status !== "ACTIVE") {
    throw new AppError("Không phải thành viên nhóm", "FORBIDDEN", 403);
  }

  const clash = await prismaRead.userGroupTasklistMap.findUnique({
    where: { userId_googleTasklistId: { userId, googleTasklistId } },
  });
  if (clash && clash.groupId !== groupId) {
    throw new AppError(
      "List Google đã gắn nhóm khác",
      "TASKLIST_IN_USE",
      409,
    );
  }

  return prismaWrite.userGroupTasklistMap.upsert({
    where: { userId_groupId: { userId, groupId } },
    create: {
      userId,
      groupId,
      googleTasklistId,
      googleTasklistTitle: googleTasklistTitle ?? null,
    },
    update: {
      googleTasklistId,
      googleTasklistTitle: googleTasklistTitle ?? null,
    },
  });
}

export async function deleteMap(userId: string, groupId: string) {
  try {
    await prismaWrite.userGroupTasklistMap.delete({
      where: { userId_groupId: { userId, groupId } },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw new AppError("Chưa gắn list", "NOT_FOUND", 404);
    }
    throw err;
  }
  return { ok: true as const };
}

async function getTasksClientForUser(userId: string) {
  const account = await prismaRead.userGoogleAccount.findFirst({
    where: { userId, isPrimary: true },
  });
  if (!account?.refreshTokenEnc) {
    throw new AppError("Chưa liên kết Google", "AUTH_REQUIRED", 401);
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new AppError("Chưa cấu hình Google OAuth", "CONFIG", 500);
  }
  let refreshToken: string;
  try {
    refreshToken = decryptSecret(account.refreshTokenEnc);
  } catch {
    throw new AppError("Không giải mã được Google token", "AUTH_REQUIRED", 401);
  }
  const oauth2 = google.auth.OAuth2(clientId, clientSecret);
  // Fix: use `new google.auth.OAuth2` — copy pattern from tasks-push.handler.ts exactly
  const oauth = new google.auth.OAuth2(clientId, clientSecret);
  const cached = getCachedAccessToken(userId);
  if (cached) {
    oauth.setCredentials({ access_token: cached, refresh_token: refreshToken });
  } else {
    oauth.setCredentials({ refresh_token: refreshToken });
    const tok = await oauth.getAccessToken();
    if (tok.token) setCachedAccessToken(userId, tok.token);
  }
  return google.tasks({ version: "v1", auth: oauth });
}

export async function listGoogleTasklists(userId: string) {
  try {
    const tasksApi = await getTasksClientForUser(userId);
    const listed = await tasksApi.tasklists.list({ maxResults: 100 });
    return (listed.data.items ?? [])
      .filter((i) => i.id)
      .map((i) => ({ id: i.id!, title: i.title ?? i.id! }));
  } catch (err) {
    if (err instanceof Error && err.message.includes("invalid_grant")) {
      clearCachedAccessToken(userId);
      throw new AppError("Cần đăng nhập lại Google", "AUTH_REQUIRED", 401);
    }
    throw err;
  }
}
```

**Important:** When implementing, remove the erroneous `google.auth.OAuth2(...)` line without `new` — keep only `new google.auth.OAuth2` as in `tasks-push.handler.ts`. Do not leave unused variables.

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd backend/apps/google-sync-service && bun test tests/tasklist-map.test.ts
```

Expected: pass for `pickUnmappedGroupIds`.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/google-sync-service/src/modules/sync/tasklist-map.service.ts \
  backend/apps/google-sync-service/tests/tasklist-map.test.ts
git commit -m "feat(sync): tasklist map service and unit helpers"
```

---

### Task 3: HTTP routes + status field

**Files:**
- Modify: `backend/apps/google-sync-service/src/modules/sync/sync.controller.ts`
- Modify: `backend/apps/google-sync-service/src/modules/sync/sync.routes.ts`
- Modify: `backend/apps/google-sync-service/src/modules/sync/sync.service.ts`

- [ ] **Step 1: Extend `getSyncStatus`**

In `getSyncStatus`, after loading account, also:

```ts
  const memberships = await prismaRead.groupMember.findMany({
    where: { userId, status: "ACTIVE" },
    select: { groupId: true },
  });
  const maps = await prismaRead.userGroupTasklistMap.findMany({
    where: { userId },
    select: { groupId: true },
  });
  const { pickUnmappedGroupIds } = await import("./tasklist-map.service.js");
  // Prefer static import at top of file instead of dynamic
  const unmappedGroupIds = pickUnmappedGroupIds(
    memberships.map((m) => m.groupId),
    maps.map((m) => m.groupId),
  );
```

Add `unmappedGroupIds` to the returned object. Prefer a normal top-level import of `pickUnmappedGroupIds`.

- [ ] **Step 2: Add controller handlers**

```ts
import * as tasklistMap from "./tasklist-map.service.js";

export async function listGoogleTasklists(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    res.json({ tasklists: await tasklistMap.listGoogleTasklists(user.id) });
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function listTasklistMaps(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    res.json(await tasklistMap.listMapsForUser(user.id));
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function putTasklistMap(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const groupId = req.params.groupId as string;
    const body = z
      .object({
        googleTasklistId: z.string().min(1),
        googleTasklistTitle: z.string().max(300).nullable().optional(),
      })
      .parse(req.body);
    const map = await tasklistMap.upsertMap(
      user.id,
      groupId,
      body.googleTasklistId,
      body.googleTasklistTitle,
    );
    res.json({ map });
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function deleteTasklistMap(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const groupId = req.params.groupId as string;
    res.json(await tasklistMap.deleteMap(user.id, groupId));
  } catch (err) {
    sendError(res, err, logger);
  }
}
```

- [ ] **Step 3: Wire routes** (near other `/sync/` user JWT routes)

```ts
syncRoutes.get("/sync/tasklists", (req, res) =>
  void syncController.listGoogleTasklists(req, res),
);
syncRoutes.get("/sync/tasklist-maps", (req, res) =>
  void syncController.listTasklistMaps(req, res),
);
syncRoutes.put("/sync/tasklist-maps/:groupId", (req, res) =>
  void syncController.putTasklistMap(req, res),
);
syncRoutes.delete("/sync/tasklist-maps/:groupId", (req, res) =>
  void syncController.deleteTasklistMap(req, res),
);
```

- [ ] **Step 4: Commit**

```bash
git add backend/apps/google-sync-service/src/modules/sync/sync.controller.ts \
  backend/apps/google-sync-service/src/modules/sync/sync.routes.ts \
  backend/apps/google-sync-service/src/modules/sync/sync.service.ts
git commit -m "feat(sync): tasklist map HTTP APIs and status unmappedGroupIds"
```

---

### Task 4: Push uses map (no fixed-title fallback)

**Files:**
- Modify: `backend/apps/google-sync-service/src/modules/sync/tasks-push.handler.ts`

- [ ] **Step 1: Replace `ensureAppTaskList` usage**

At start of successful auth path in `processTaskPushJob`, after loading tokens:

1. Load local task with `select: { parentId: true, groupId: true }`.
2. Call `resolveTasklistIdForPush(job.userId, localTask.groupId)`.
3. If `null`:

```ts
      await markJobDone(job.id);
      logger.info({ jobId: job.id }, "TASKS_PUSH skipped — no_tasklist_map");
      return;
```

4. Use that `listId` for `tasks.insert` / `tasks.patch` instead of `await ensureAppTaskList(tasksApi)`.
5. Keep parent link resolution as today.
6. Remove or stop calling `ensureAppTaskList` / `listTitle` for push (function may remain unused — delete if unused to avoid lint noise).

- [ ] **Step 2: Smoke typecheck if available**

```bash
cd backend/apps/google-sync-service && bunx tsc --noEmit -p tsconfig.json 2>&1 | head -40
```

Fix only errors introduced by this change.

- [ ] **Step 3: Commit**

```bash
git add backend/apps/google-sync-service/src/modules/sync/tasks-push.handler.ts
git commit -m "feat(sync): push Google tasks only into mapped list"
```

---

### Task 5: Pull uses maps only

**Files:**
- Modify: `backend/apps/google-sync-service/src/modules/sync/tasks-pull.handler.ts`

- [ ] **Step 1: Change `resolvePullListIds`**

Replace title/`@default` logic with maps:

```ts
async function resolvePullListIds(userId: string): Promise<
  Array<{ listId: string; groupId: string }>
> {
  const maps = await prismaRead.userGroupTasklistMap.findMany({
    where: { userId },
    select: { googleTasklistId: true, groupId: true },
  });
  return maps.map((m) => ({ listId: m.googleTasklistId, groupId: m.groupId }));
}
```

Update call site:

```ts
    const mappedLists = await resolvePullListIds(job.userId);
    if (mappedLists.length === 0) {
      // still update lastPullAt + mark done — nothing to pull
      ...
    }

    for (const { listId, groupId: mappedGroupId } of mappedLists) {
      const items = await listAllTasks(tasksApi, listId, updatedMin);
      for (const item of items) {
        // ... existing link/update logic ...
        // For importGoogleNativeTask, pass mappedGroupId as preferredGroupId
        // so import lands in the mapped group:
        const importedId = await importGoogleNativeTask({
          userId: job.userId,
          listId,
          item,
          tasksApi,
          preferredGroupId: mappedGroupId,
        });
```

Ensure `resolveImportGroupId` still validates membership for `mappedGroupId`.

Remove unused `listTitle` / `GOOGLE_TASKS_LIST_TITLE` from this file if no longer referenced.

- [ ] **Step 2: Commit**

```bash
git add backend/apps/google-sync-service/src/modules/sync/tasks-pull.handler.ts
git commit -m "feat(sync): pull only mapped Google task lists"
```

---

### Task 6: Flutter models + repository

**Files:**
- Modify: `frontend/lib/core/models/api_models.dart`
- Modify: `frontend/lib/features/home/data/sync_repository.dart`

- [ ] **Step 1: Add DTOs and extend `SyncStatus`**

```dart
class GoogleTasklistItem {
  const GoogleTasklistItem({required this.id, required this.title});
  final String id;
  final String title;
  factory GoogleTasklistItem.fromJson(Map<String, dynamic> j) =>
      GoogleTasklistItem(
        id: j['id'] as String,
        title: j['title'] as String? ?? j['id'] as String,
      );
}

class TasklistMapRow {
  const TasklistMapRow({
    required this.groupId,
    required this.groupName,
    required this.mapped,
    this.googleTasklistId,
    this.googleTasklistTitle,
  });
  final String groupId;
  final String groupName;
  final bool mapped;
  final String? googleTasklistId;
  final String? googleTasklistTitle;
  factory TasklistMapRow.fromJson(Map<String, dynamic> j) => TasklistMapRow(
        groupId: j['groupId'] as String,
        groupName: j['groupName'] as String? ?? '',
        mapped: j['mapped'] as bool? ?? false,
        googleTasklistId: j['googleTasklistId'] as String?,
        googleTasklistTitle: j['googleTasklistTitle'] as String?,
      );
}
```

Add to `SyncStatus`:

```dart
  final List<String> unmappedGroupIds;
```

Parse: `(j['unmappedGroupIds'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList()`.

- [ ] **Step 2: Repository methods**

```dart
  Future<List<GoogleTasklistItem>> listGoogleTasklists() async {
    final res = await _api.dio.get<Map<String, dynamic>>('/sync/tasklists');
    final list = res.data?['tasklists'] as List<dynamic>? ?? const [];
    return list
        .map((e) => GoogleTasklistItem.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<({List<TasklistMapRow> groups, List<String> unmappedGroupIds})>
      listTasklistMaps() async {
    final res =
        await _api.dio.get<Map<String, dynamic>>('/sync/tasklist-maps');
    final data = res.data ?? {};
    final groups = (data['groups'] as List<dynamic>? ?? const [])
        .map((e) => TasklistMapRow.fromJson(e as Map<String, dynamic>))
        .toList();
    final unmapped = (data['unmappedGroupIds'] as List<dynamic>? ?? const [])
        .map((e) => e.toString())
        .toList();
    return (groups: groups, unmappedGroupIds: unmapped);
  }

  Future<void> putTasklistMap(
    String groupId, {
    required String googleTasklistId,
    String? googleTasklistTitle,
  }) async {
    await _api.dio.put(
      '/sync/tasklist-maps/$groupId',
      data: {
        'googleTasklistId': googleTasklistId,
        if (googleTasklistTitle != null)
          'googleTasklistTitle': googleTasklistTitle,
      },
    );
  }

  Future<void> deleteTasklistMap(String groupId) async {
    await _api.dio.delete('/sync/tasklist-maps/$groupId');
  }
```

Wrap with try/`mapDioError` like existing methods.

- [ ] **Step 3: Analyze**

```bash
cd frontend && dart analyze lib/core/models/api_models.dart lib/features/home/data/sync_repository.dart
```

Expected: no errors (fix ok).

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/core/models/api_models.dart \
  frontend/lib/features/home/data/sync_repository.dart
git commit -m "feat(flutter): sync repository for Google tasklist maps"
```

---

### Task 7: Sync bloc + Sync tab UI

**Files:**
- Modify: `frontend/lib/features/sync/bloc/sync_event.dart`
- Modify: `frontend/lib/features/sync/bloc/sync_state.dart`
- Modify: `frontend/lib/features/sync/bloc/sync_bloc.dart`
- Modify: `frontend/lib/features/sync/pages/sync_tab_page.dart`

- [ ] **Step 1: State fields on `SyncReady`**

```dart
  final List<TasklistMapRow> tasklistMaps;
  final List<GoogleTasklistItem> googleTasklists;
  final bool mapsBusy;
```

Defaults: `const []`, `mapsBusy: false`. Include in `copyWith` / `props`.

- [ ] **Step 2: Events**

```dart
class SyncTasklistMapsRefreshRequested extends SyncEvent {
  const SyncTasklistMapsRefreshRequested();
}

class SyncTasklistMapSetRequested extends SyncEvent {
  const SyncTasklistMapSetRequested({
    required this.groupId,
    required this.googleTasklistId,
    this.googleTasklistTitle,
  });
  final String groupId;
  final String googleTasklistId;
  final String? googleTasklistTitle;
  @override
  List<Object?> get props => [groupId, googleTasklistId, googleTasklistTitle];
}

class SyncTasklistMapClearRequested extends SyncEvent {
  const SyncTasklistMapClearRequested(this.groupId);
  final String groupId;
  @override
  List<Object?> get props => [groupId];
}
```

- [ ] **Step 3: Bloc handlers**

On `SyncStarted` / `SyncRefreshRequested` (when `googleLinked`): also load maps + tasklists (best-effort; empty on failure).

Handlers:

- Refresh → `listTasklistMaps` + `listGoogleTasklists`
- Set → `putTasklistMap` then refresh maps + `status()` (to refresh `unmappedGroupIds`)
- Clear → `deleteTasklistMap` then refresh

- [ ] **Step 4: UI section on Sync tab**

Below the Pull/Full buttons row (only when `s.googleLinked`), add `AppSectionCard(title: 'Gắn Google Task list')` listing `ready.tasklistMaps` rows:

- Subtitle: group name
- `DropdownButton<String?>` of google tasklists; value = current `googleTasklistId`
- Disable options whose id is already mapped to a **different** group
- Include a null / “Chưa gắn” option that fires clear
- On change → `SyncTasklistMapSetRequested` with title from selected item

- [ ] **Step 5: Analyze Sync feature**

```bash
cd frontend && dart analyze lib/features/sync
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/features/sync
git commit -m "feat(flutter): Sync tab Google tasklist mapping UI"
```

---

### Task 8: Tasks banner + verify runbook

**Files:**
- Modify: `frontend/lib/features/tasks/pages/tasks_tab_page.dart`
- Modify: `backend/docs/runbooks/google-tasks-sync-setup.md` (short note)

- [ ] **Step 1: Banner on Tasks**

Near top of the Tasks column (under title row), when workspace has `selectedGroupId` and Sync status (or a lightweight check) shows that id in `unmappedGroupIds`:

Preferred approach without coupling TasksBloc to SyncRepository heavily:

- Read `SyncBloc` if provided above shell (it is — see `app_router.dart`).
- From `SyncReady.status.unmappedGroupIds`, if contains current group → show Material banner / colored container:

```dart
MaterialBanner(
  content: const Text('Chưa gắn Google Task list cho nhóm này. Sync sẽ không chạy.'),
  actions: [
    TextButton(
      onPressed: () => context.go(AppRoutes.sync.path),
      child: const Text('Gắn ngay'),
    ),
  ],
)
```

Use `go_router` `context.go` — import `AppRoutes` from router. If SyncBloc not ready yet, omit banner (no false positive).

Also dispatch `SyncRefreshRequested` once when Tasks mounts and Google is linked so `unmappedGroupIds` is fresh (optional; SyncStarted on app load may already populate).

- [ ] **Step 2: Runbook note**

Replace the line saying tasks always push to `GOOGLE_TASKS_LIST_TITLE` with:

> Mỗi user phải gắn Google Task list ↔ group trên tab Sync. Chưa gắn → không push/pull Tasks cho group đó.

- [ ] **Step 3: Analyze + manual checklist**

```bash
cd frontend && dart analyze lib/features/tasks/pages/tasks_tab_page.dart
```

Manual:

1. Restart google-sync + migrate `017`.
2. Open Sync → map a list to current group.
3. Create task → appears on that Google list.
4. Clear map → new edits do not push; banner shows on Tasks.
5. Map list A to group 1, try same list for group 2 → error snackbar (409).

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/features/tasks/pages/tasks_tab_page.dart \
  backend/docs/runbooks/google-tasks-sync-setup.md
git commit -m "feat(flutter): Tasks banner for unmapped Google tasklist"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Table + unique constraints | 1 |
| Map CRUD + list Google lists | 2–3 |
| `unmappedGroupIds` on status | 3 |
| Push skip if unmapped | 4 |
| Pull only mapped lists / import to mapped group | 5 |
| Sync UI + Tasks banner | 7–8 |
| No migrate on remap | 4–5 (no migrate code) |
| No Manage Teams fallback | 4–5 |
| Tests for unmapped helper | 2 |
| Runbook | 8 |

## Placeholder / consistency review

- Service uses Prisma compound names `userId_groupId` and `userId_googleTasklistId` matching `@@unique` in Task 1.
- OAuth client construction must copy `tasks-push.handler.ts` (`new google.auth.OAuth2`) — do not leave a broken duplicate line from the draft snippet.
- Flutter route: `AppRoutes.sync.path` (`/sync`).
