# In-app Google Sheets Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the real Google Spreadsheet for a Vimes group in a full-tab WebView on Android/iOS/macOS; on Flutter web and Windows open externally; share the Drive file with group members’ linked Google emails on ensure/LIVE create.

**Architecture:** FE adds `SheetEditorPage` + `SheetEmbedView` under `/sync/sheet/:groupId`, reusing `SyncBloc` push/pull. BE adds `shareSpreadsheetWithGroupMembers` in `sheets-live.ts`, called after LIVE spreadsheet create and when user ensure creates/updates a LIVE sheet. No new public read APIs for embed.

**Tech Stack:** Flutter (`webview_flutter`, `url_launcher`, `go_router`, bloc), Bun + Vitest (`google-sync-service`), Google Drive Permissions API (`drive.file`).

**Spec:** `docs/superpowers/specs/2026-09-30-in-app-google-sheets-editor-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `frontend/lib/core/models/api_models.dart` | `googleSheetUrl` includes `/edit` |
| `frontend/test/core/models/api_models_test.dart` | Assert LIVE URL ends with `/edit` |
| `backend/apps/google-sync-service/src/modules/sync/sheets-share.ts` | Resolve member Google emails + Drive `permissions.create` |
| `backend/apps/google-sync-service/src/modules/sync/sheets-live.ts` | Export helpers already; call share from create path if needed |
| `backend/apps/google-sync-service/src/modules/sync/sheets.handler.ts` | After LIVE create/push update, share; enhance ensure for LIVE |
| `backend/apps/google-sync-service/src/modules/sync/sync.controller.ts` | `ensureSheetUser` returns sheet after LIVE ensure+share |
| `backend/apps/google-sync-service/tests/sheets-share.test.ts` | Unit tests for email collect + idempotent share helper |
| `frontend/lib/features/sync/widgets/sheet_embed_view.dart` | Native WebView vs external-only stub |
| `frontend/lib/features/sync/pages/sheet_editor_page.dart` | Full-tab toolbar + embed/fallback |
| `frontend/lib/app/router/app_router.dart` | Nested route `/sync/sheet/:groupId` |
| `frontend/lib/features/sync/pages/sync_tab_page.dart` | Navigate to editor (native) / launch URL (web/Windows) |
| `frontend/test/features/sync/sheet_editor_page_test.dart` | Toolbar + local-matrix / external CTA |

---

### Task 1: Fix `googleSheetUrl` to `/edit`

**Files:**
- Modify: `frontend/lib/core/models/api_models.dart`
- Modify: `frontend/test/core/models/api_models_test.dart`

- [ ] **Step 1: Write failing test for LIVE URL**

Add to `api_models_test.dart`:

```dart
test('GroupSheetDto.googleSheetUrl uses /edit for real ids', () {
  final s = GroupSheetDto.fromJson({
    'id': 'sid',
    'groupId': 'gid',
    'spreadsheetId': '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
    'sheetTitle': 'Tasks',
    'driveFileId': '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
    'status': 'PUSHED',
    'lastPushAt': null,
    'lastPullAt': null,
    'contentHash': null,
    'rowHashes': <String, dynamic>{},
    'writableColumns': ['status', 'personal_note'],
    'ownerUserId': 'u1',
    'createdAt': '2026-09-28T07:00:00.000Z',
    'updatedAt': '2026-09-28T07:00:00.000Z',
  });
  expect(s.isLocalMatrix, isFalse);
  expect(
    s.googleSheetUrl,
    'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
  );
});
```

- [ ] **Step 2: Run test — expect FAIL** (URL missing `/edit`)

Run: `cd frontend && flutter test test/core/models/api_models_test.dart`

- [ ] **Step 3: Update getter**

In `api_models.dart`:

```dart
String? get googleSheetUrl => isLocalMatrix || spreadsheetId == null
    ? null
    : 'https://docs.google.com/spreadsheets/d/$spreadsheetId/edit';
```

- [ ] **Step 4: Re-run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/core/models/api_models.dart frontend/test/core/models/api_models_test.dart
git commit -m "fix(sync): point googleSheetUrl at /edit"
```

---

### Task 2: Drive share helper (unit-tested)

**Files:**
- Create: `backend/apps/google-sync-service/src/modules/sync/sheets-share.ts`
- Create: `backend/apps/google-sync-service/tests/sheets-share.test.ts`

- [ ] **Step 1: Write failing tests for pure helpers**

`tests/sheets-share.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { collectShareEmails, isAlreadySharedError } from "../src/modules/sync/sheets-share.js";

describe("sheets-share", () => {
  it("collectShareEmails prefers primary Google email per user", () => {
    const emails = collectShareEmails([
      { userId: "u1", email: "a@x.com", isPrimary: false },
      { userId: "u1", email: "primary@x.com", isPrimary: true },
      { userId: "u2", email: null, isPrimary: true },
      { userId: "u3", email: "m@y.com", isPrimary: true },
    ]);
    expect(emails.sort()).toEqual(["m@y.com", "primary@x.com"]);
  });

  it("isAlreadySharedError detects duplicate permission", () => {
    expect(
      isAlreadySharedError({ code: 403, errors: [{ reason: "alreadyExists" }] }),
    ).toBe(true);
    expect(isAlreadySharedError(new Error("boom"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module missing)

Run: `cd backend/apps/google-sync-service && bun test tests/sheets-share.test.ts`

- [ ] **Step 3: Implement `sheets-share.ts`**

```ts
import { prismaRead } from "@manage-teams/db";
import { createLogger } from "@manage-teams/lib";
import { driveClient, getGoogleOAuthForUser } from "../../infra/google-oauth-client.js";
import { googleLimiter } from "../../infra/google-limiter.js";
import { isRealSpreadsheetId } from "./sheets-live.js";

const logger = createLogger("google-sync-service");

export type GoogleEmailRow = {
  userId: string;
  email: string | null;
  isPrimary: boolean;
};

/** One email per userId: primary linked Google account with non-empty email. */
export function collectShareEmails(rows: GoogleEmailRow[]): string[] {
  const byUser = new Map<string, GoogleEmailRow[]>();
  for (const r of rows) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }
  const out: string[] = [];
  for (const list of byUser.values()) {
    const primary = list.find((x) => x.isPrimary && x.email?.trim());
    const any = list.find((x) => x.email?.trim());
    const email = (primary ?? any)?.email?.trim();
    if (email) out.push(email);
  }
  return out;
}

export function isAlreadySharedError(err: unknown): boolean {
  const e = err as {
    code?: number;
    errors?: Array<{ reason?: string }>;
    message?: string;
  };
  if (e?.errors?.some((x) => x.reason === "alreadyExists")) return true;
  const msg = typeof e?.message === "string" ? e.message : String(err);
  return /alreadyExists|already a permission/i.test(msg);
}

export async function shareSpreadsheetWithGroupMembers(input: {
  ownerUserId: string;
  groupId: string;
  spreadsheetId: string;
}): Promise<{ shared: number; skipped: number }> {
  if (!isRealSpreadsheetId(input.spreadsheetId)) {
    return { shared: 0, skipped: 0 };
  }

  const members = await prismaRead.groupMember.findMany({
    where: { groupId: input.groupId, status: "ACTIVE" },
    select: { userId: true },
  });
  const userIds = members.map((m) => m.userId);
  if (userIds.length === 0) return { shared: 0, skipped: 0 };

  const accounts = await prismaRead.userGoogleAccount.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, email: true, isPrimary: true },
  });
  const emails = collectShareEmails(accounts);
  if (emails.length === 0) return { shared: 0, skipped: userIds.length };

  const ok = await googleLimiter.acquire(input.ownerUserId);
  if (!ok) throw new Error("rate_limit_wait");

  const { oauth2 } = await getGoogleOAuthForUser(input.ownerUserId);
  const drive = driveClient(oauth2);

  let shared = 0;
  let skipped = 0;
  for (const email of emails) {
    try {
      await drive.permissions.create({
        fileId: input.spreadsheetId,
        sendNotificationEmail: false,
        requestBody: {
          type: "user",
          role: "writer",
          emailAddress: email,
        },
      });
      shared += 1;
    } catch (err) {
      if (isAlreadySharedError(err)) {
        shared += 1;
        continue;
      }
      skipped += 1;
      logger.warn(
        { groupId: input.groupId, email, err: String(err) },
        "sheets share permission failed",
      );
    }
  }
  logger.info(
    { groupId: input.groupId, spreadsheetId: input.spreadsheetId, shared, skipped },
    "sheets share done",
  );
  return { shared, skipped };
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/apps/google-sync-service/src/modules/sync/sheets-share.ts \
  backend/apps/google-sync-service/tests/sheets-share.test.ts
git commit -m "feat(sheets): add Drive share helper for group members"
```

---

### Task 3: Wire share into LIVE create + ensure

**Files:**
- Modify: `backend/apps/google-sync-service/src/modules/sync/sheets.handler.ts`
- Modify: `backend/apps/google-sync-service/src/modules/sync/sync.controller.ts`

- [ ] **Step 1: Add `ensureLiveGroupSheet` in `sheets.handler.ts`**

After imports, add share import and:

```ts
import { shareSpreadsheetWithGroupMembers } from "./sheets-share.js";

/** DB ensure + (when LIVE) create Drive spreadsheet + share writers. */
export async function ensureLiveGroupSheet(groupId: string, ownerUserId: string) {
  const sheet = await ensureGroupSheet(groupId, ownerUserId);
  if (!LIVE) return sheet;

  const { spreadsheetId, created } = await ensureLiveSpreadsheet({
    userId: ownerUserId,
    groupId,
    spreadsheetId: isRealSpreadsheetId(sheet.spreadsheetId)
      ? sheet.spreadsheetId
      : null,
  });

  const updated = await prismaWrite.groupSheet.update({
    where: { groupId },
    data: {
      spreadsheetId,
      driveFileId: spreadsheetId,
      updatedAt: new Date(),
    },
  });

  try {
    await shareSpreadsheetWithGroupMembers({
      ownerUserId,
      groupId,
      spreadsheetId,
    });
  } catch (err) {
    logger.warn(
      { groupId, spreadsheetId, created, err: String(err) },
      "sheets share after ensure failed",
    );
  }

  return updated;
}
```

- [ ] **Step 2: Call share after LIVE push create/update**

In `processSheetsPushJob`, after successful `groupSheet.update` with LIVE `spreadsheetId`, before `markJobDone`:

```ts
try {
  await shareSpreadsheetWithGroupMembers({
    ownerUserId: job.userId,
    groupId,
    spreadsheetId,
  });
} catch (shareErr) {
  logger.warn(
    { jobId: job.id, groupId, err: String(shareErr) },
    "sheets share after push failed",
  );
}
```

(Share failure must not fail the push job.)

- [ ] **Step 3: Point user ensure at LIVE path**

In `sync.controller.ts` `ensureSheetUser`:

```ts
res.status(201).json(await ensureLiveGroupSheet(groupId, user.id));
```

Import `ensureLiveGroupSheet` instead of (or in addition to) `ensureGroupSheet`. Keep internal `ensureSheet` on `ensureGroupSheet` only (ops/tests) **or** also switch internal to LIVE ensure — prefer **user route only** for LIVE create to avoid surprising internal callers; document in comment.

- [ ] **Step 4: Smoke analyze / typecheck**

Run: `cd backend/apps/google-sync-service && bunx tsc --noEmit` (or package script if present)

- [ ] **Step 5: Commit**

```bash
git add backend/apps/google-sync-service/src/modules/sync/sheets.handler.ts \
  backend/apps/google-sync-service/src/modules/sync/sync.controller.ts
git commit -m "feat(sheets): share Drive file on ensure and LIVE push"
```

---

### Task 4: `SheetEmbedView` (platform split)

**Files:**
- Create: `frontend/lib/features/sync/widgets/sheet_embed_view.dart`

- [ ] **Step 1: Implement widget**

```dart
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:manage_teams/shared/theme/color_skin.dart';
import 'package:manage_teams/shared/widgets/app_button.dart';

bool supportsInAppSheetEmbed() {
  if (kIsWeb) return false;
  switch (defaultTargetPlatform) {
    case TargetPlatform.android:
    case TargetPlatform.iOS:
    case TargetPlatform.macOS:
      return true;
    default:
      return false;
  }
}

class SheetEmbedView extends StatefulWidget {
  const SheetEmbedView({
    super.key,
    required this.url,
    this.onWebResourceError,
  });

  final String url;
  final void Function(String message)? onWebResourceError;

  @override
  State<SheetEmbedView> createState() => _SheetEmbedViewState();
}

class _SheetEmbedViewState extends State<SheetEmbedView> {
  WebViewController? _controller;
  var _failed = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (!supportsInAppSheetEmbed()) return;
    final c = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onWebResourceError: (err) {
            setState(() {
              _failed = true;
              _error = err.description;
            });
            widget.onWebResourceError?.call(err.description);
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.url));
    _controller = c;
  }

  Future<void> _openExternal() async {
    final uri = Uri.parse(widget.url);
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      // ignore — parent may snackbar
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!supportsInAppSheetEmbed()) {
      return _Fallback(
        message:
            'Chỉnh sửa trong app hỗ trợ trên Android, iOS và macOS. Mở Google Sheets trên trình duyệt.',
        onOpen: _openExternal,
      );
    }
    if (_failed) {
      return _Fallback(
        message: _error ?? 'Không tải được Google Sheets trong app.',
        onOpen: _openExternal,
      );
    }
    final c = _controller;
    if (c == null) {
      return const Center(child: CircularProgressIndicator());
    }
    return WebViewWidget(controller: c);
  }
}

class _Fallback extends StatelessWidget {
  const _Fallback({required this.message, required this.onOpen});
  final String message;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center,
                style: const TextStyle(color: ColorSkin.subtitle)),
            const SizedBox(height: 16),
            AppButton(
              label: 'Mở Google Sheets',
              variant: AppButtonVariant.primary,
              onPressed: onOpen,
            ),
          ],
        ),
      ),
    );
  }
}
```

Adjust `AppButton` / `ColorSkin` import paths to match the repo (same as `sync_tab_page.dart`).

- [ ] **Step 2: `dart analyze` on the file — no errors**

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/features/sync/widgets/sheet_embed_view.dart
git commit -m "feat(sync): add SheetEmbedView WebView with platform fallback"
```

---

### Task 5: `SheetEditorPage` + route

**Files:**
- Create: `frontend/lib/features/sync/pages/sheet_editor_page.dart`
- Create: `frontend/test/features/sync/sheet_editor_page_test.dart`
- Modify: `frontend/lib/app/router/app_router.dart`

- [ ] **Step 1: Write widget test (toolbar + local blocks embed)**

Use a test harness with `SyncBloc` stub/`Mock` if the project already mocks Sync; otherwise pump `SheetEditorPage` with injected sheet DTO parameters to avoid full bloc:

Prefer constructor:

```dart
class SheetEditorPage extends StatelessWidget {
  const SheetEditorPage({
    super.key,
    required this.groupId,
    this.sheetTitle,
    this.spreadsheetUrl,
    this.isLocalMatrix = false,
  });
  // ...
}
```

Test:

```dart
testWidgets('local matrix shows message and no WebView', (tester) async {
  await tester.pumpWidget(
    MaterialApp(
      home: SheetEditorPage(
        groupId: 'g1',
        sheetTitle: 'Tasks',
        isLocalMatrix: true,
      ),
    ),
  );
  expect(find.textContaining('local'), findsOneWidget); // or Vietnamese copy
  expect(find.text('Mở Google Sheets'), findsNothing);
});

testWidgets('LIVE shows open-external and back', (tester) async {
  await tester.pumpWidget(
    MaterialApp(
      home: SheetEditorPage(
        groupId: 'g1',
        sheetTitle: 'Tasks',
        spreadsheetUrl:
            'https://docs.google.com/spreadsheets/d/abc/edit',
        isLocalMatrix: false,
      ),
    ),
  );
  expect(find.text('Tasks'), findsWidgets);
  expect(find.byTooltip('Quay lại'), findsOneWidget); // or IconButton semantics
});
```

Tune finders to the real toolbar widgets you build in Step 2.

- [ ] **Step 2: Implement `SheetEditorPage`**

Layout:

- `AppBar` / top `Row`: back (`context.pop()`), title, Push, Pull, open-external.
- Push/Pull: `context.read<SyncBloc>().add(const SyncSheetPushRequested())` / `Pull` — requires page under existing `BlocProvider<SyncBloc>` from shell (same as Sync tab).
- Body: if `isLocalMatrix` or url null → message; else `SheetEmbedView(url: spreadsheetUrl!)`.
- Listen to `WorkspaceBloc`: if `selectedGroupId != groupId`, `context.pop()`.

- [ ] **Step 3: Nest route under sync branch**

In `app_router.dart`, change Sync branch to:

```dart
StatefulShellBranch(
  routes: [
    GoRoute(
      path: AppRoutes.sync.path,
      builder: (context, state) => const SyncTabPage(),
      routes: [
        GoRoute(
          path: 'sheet/:groupId',
          builder: (context, state) {
            final groupId = state.pathParameters['groupId']!;
            final extra = _extraMap(state.extra);
            return SheetEditorPage(
              groupId: groupId,
              sheetTitle: extra?['sheetTitle'] as String?,
              spreadsheetUrl: extra?['spreadsheetUrl'] as String?,
              isLocalMatrix: extra?['isLocalMatrix'] == true,
            );
          },
        ),
      ],
    ),
  ],
),
```

Full path: `/sync/sheet/:groupId`.

- [ ] **Step 4: Run widget test + analyze**

Run: `cd frontend && flutter test test/features/sync/sheet_editor_page_test.dart`

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/features/sync/pages/sheet_editor_page.dart \
  frontend/test/features/sync/sheet_editor_page_test.dart \
  frontend/lib/app/router/app_router.dart
git commit -m "feat(sync): add SheetEditorPage route under /sync/sheet/:groupId"
```

---

### Task 6: Wire Sheets list open actions

**Files:**
- Modify: `frontend/lib/features/sync/pages/sync_tab_page.dart`

- [ ] **Step 1: Replace / extend “Mở trên Google Sheets”**

Import `sheet_embed_view.dart` (`supportsInAppSheetEmbed`) and `go_router`.

When `sheet.googleSheetUrl != null`:

```dart
AppButton(
  label: supportsInAppSheetEmbed()
      ? 'Mở trong app'
      : 'Mở Google Sheets',
  variant: AppButtonVariant.primary,
  onPressed: () {
    final url = sheet.googleSheetUrl!;
    if (supportsInAppSheetEmbed()) {
      context.push(
        '/sync/sheet/${sheet.groupId}',
        extra: {
          'sheetTitle': sheet.sheetTitle,
          'spreadsheetUrl': url,
          'isLocalMatrix': sheet.isLocalMatrix,
        },
      );
    } else {
      _openSheet(url);
    }
  },
),
```

Keep a secondary text button **Mở ngoài** on native when already in list (optional): only required on editor toolbar per spec; list can be single primary CTA.

- [ ] **Step 2: Manual sanity on Chrome** — button says “Mở Google Sheets” and launches external tab (no crash).

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/features/sync/pages/sync_tab_page.dart
git commit -m "feat(sync): open sheet in-app on supported platforms"
```

---

### Task 7: Verification checklist + docs touch

**Files:** none required (manual)

- [ ] **Step 1: Run automated suites**

```bash
cd frontend && flutter test test/core/models/api_models_test.dart test/features/sync/sheet_editor_page_test.dart
cd backend/apps/google-sync-service && bun test tests/sheets-share.test.ts tests/sheets-matrix.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Manual (when `GOOGLE_SHEETS_LIVE=true`)**

1. Ensure sheet for a group → spreadsheetId real; Drive shows shared writers for members with Google email.
2. macOS/iOS/Android build: **Mở trong app** loads editor; edit a writable cell; Pull updates Vimes.
3. Chrome: **Mở Google Sheets** opens new tab; no iframe editor.
4. Local matrix: no in-app open.

- [ ] **Step 3: Commit only if checklist docs added** (optional note in runbook)

If updating runbook:

```bash
# append short “In-app editor” section to backend/docs/runbooks/phase-4-5-deepen.md
git add backend/docs/runbooks/phase-4-5-deepen.md
git commit -m "docs: note in-app Sheets editor platforms and Drive share"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Full-tab editor + toolbar Push/Pull/Back/Mở ngoài | 5 |
| Native WebView Android/iOS/macOS | 4, 5, 6 |
| Web + Windows external open | 4, 6 |
| No iframe happy path on web | 4, 6 |
| `googleSheetUrl` `/edit` | 1 |
| Drive share on ensure / LIVE create | 2, 3 |
| Local matrix blocked | 5, 6 |
| Header group change → pop list | 5 |
| Embed failure banner + open external | 4 |
| Tests | 1, 2, 5, 7 |

No TBD placeholders. Types: `ensureLiveGroupSheet`, `shareSpreadsheetWithGroupMembers`, `supportsInAppSheetEmbed`, `SheetEditorPage` — consistent across tasks.
