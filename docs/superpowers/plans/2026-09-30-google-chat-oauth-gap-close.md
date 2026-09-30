# Google Chat OAuth Gap-Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Workspace users able to link Google Chat spaces, send text from the app, and see Google messages via poll — by diagnosing first, then closing proven OAuth/readiness/path gaps.

**Architecture:** Keep the existing Flutter → gateway → `google-sync-service` → Google Chat API live client. No `chat-service` mirror. Task 0 records gateway smoke; only then fix classifier, identity scopes, silent `authorizeServer`, optional `%2F` route shape, and runbook.

**Tech Stack:** Express/TS, Vitest, Flutter/Dart, googleapis Chat v1, curl via API gateway

**Spec:** `docs/superpowers/specs/2026-09-30-google-chat-oauth-gap-close-design.md`

**Do not execute:** `docs/superpowers/plans/2026-09-29-google-chat-oauth-proxy.md` (historical / superseded)

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/apps/google-sync-service/src/modules/chat/chat-readiness.ts` | Classifier order (scopes / chat_disabled / GCP / bare 403) |
| `backend/apps/google-sync-service/tests/chat-readiness.test.ts` | Unit coverage for classifier |
| `backend/apps/identity-service/src/infra/google-oauth.ts` | Add Chat scopes to `GOOGLE_OAUTH_SCOPES` |
| `frontend/lib/features/auth/data/google_sign_in_helper.dart` | Fail loudly when offline/Chat server auth is required |
| `frontend/lib/features/auth/pages/link_google_page.dart` | Call helper with `requireOfflineAccess: true` |
| `frontend/lib/features/sync/pages/sync_tab_page.dart` | Same for Relink |
| `frontend/lib/features/shell/widgets/account_switcher.dart` | Same for header link Google |
| `backend/apps/google-sync-service/src/modules/chat/chat-proxy.controller.ts` | **Only if Task 0 proves `%2F` broken:** query/body `spaceName` handlers |
| `backend/apps/google-sync-service/src/modules/sync/sync.routes.ts` | Register alternate message routes if needed |
| `frontend/lib/features/home/data/google_chat_repository.dart` | Match API if path shape changes |
| `backend/docs/runbooks/google-chat-oauth-proxy.md` | Task 0 checklist, classifier notes, Gmail soft DoD |

---

### Task 0: Diagnose-first smoke (blocker)

**Files:**
- Modify (later): `backend/docs/runbooks/google-chat-oauth-proxy.md` (paste evidence notes into Task 5)
- No product code in this task

- [ ] **Step 1: Confirm stack + ask operator for JWT**

Ensure gateway (`:3000` or project default), `google-sync-service`, and DB are up.

If you do not have a real user JWT from a Google-linked account, **stop and ask the user** for either:
- a JWT after login in Chrome, or
- to complete login/Relink while you watch readiness

Do not invent fake tokens or skip this task.

- [ ] **Step 2: Operator GCP checklist (user confirms)**

Ask user to confirm (yes/no):
1. Google Cloud project has **Google Chat API** enabled  
2. OAuth consent screen includes Chat scopes listed in the runbook  

Record answers in the commit message notes or a short comment in the PR — not secrets.

- [ ] **Step 3: Readiness via gateway**

```bash
export JWT='<operator-jwt>'
export GW="${GW:-http://localhost:3000}"
curl -sS -H "Authorization: Bearer $JWT" "$GW/sync/chat/readiness" | tee /tmp/chat-readiness.json
```

Expected shapes:
- `{"status":"ready"}` → continue Step 4  
- `{"status":"needs_reconsent",...}` → user Relinks Google with Chat scopes; re-run this curl  
- `{"status":"chat_disabled",...}` on Workspace → treat as **fail** (investigate classifier/GCP); on Gmail may be soft OK later  
- `{"status":"error",...}` → capture body; fix only with evidence in later tasks  

- [ ] **Step 4: Spaces → link → messages via gateway**

```bash
# List spaces (requires ready)
curl -sS -H "Authorization: Bearer $JWT" "$GW/sync/chat/spaces" | tee /tmp/chat-spaces.json

# List links for a known group (replace GROUP_ID)
export GROUP_ID='<uuid>'
curl -sS -H "Authorization: Bearer $JWT" "$GW/sync/chat/links?groupId=$GROUP_ID" | tee /tmp/chat-links.json

# If no link: POST one spaceName from spaces list (OWNER/ADMIN JWT)
# export SPACE='spaces/XXXX'
# curl -sS -X POST -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
#   -d "{\"groupId\":\"$GROUP_ID\",\"spaceName\":\"$SPACE\"}" \
#   "$GW/sync/chat/links" | tee /tmp/chat-link-create.json

export SPACE='spaces/XXXX'   # linked space
ENCODED=$(python3 -c "import urllib.parse,os; print(urllib.parse.quote(os.environ['SPACE'], safe=''))")
curl -sS -H "Authorization: Bearer $JWT" \
  "$GW/sync/chat/spaces/$ENCODED/messages?groupId=$GROUP_ID" | tee /tmp/chat-messages.json

curl -sS -X POST -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d "{\"groupId\":\"$GROUP_ID\",\"text\":\"gap-close smoke $(date -u +%H:%M:%S)\"}" \
  "$GW/sync/chat/spaces/$ENCODED/messages" | tee /tmp/chat-send.json
```

Record:
- HTTP status of list/send  
- Whether `%2F` path returned 404/BAD_GATEWAY vs JSON messages  

- [ ] **Step 5: Branching decision (write down)**

| Observation | Next tasks |
|-------------|------------|
| Ready + list/send OK via gateway | Still do Tasks 1–3 + 5 (hardening); **skip Task 4** |
| Ready but list/send 404 on encoded path | Tasks 1–3 + **Task 4 required** + 5 |
| needs_reconsent even after Relink | Tasks 2–3 (+1); re-smoke |
| Bare 403 mislabeled chat_disabled | Task 1 critical |
| Missing JWT/GCP | **Stop**; ask user |

- [ ] **Step 6: Commit (evidence note only if you create a notes file; otherwise proceed without commit)**

No code commit required for Task 0. Keep `/tmp/chat-*.json` locally for the implementer; do not commit secrets/JWT.

---

### Task 1: Fix readiness classifier (TDD)

**Files:**
- Modify: `backend/apps/google-sync-service/tests/chat-readiness.test.ts`
- Modify: `backend/apps/google-sync-service/src/modules/chat/chat-readiness.ts`

- [ ] **Step 1: Extend failing tests**

Replace/extend `chat-readiness.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  classifyChatProbeError,
  type ChatReadiness,
} from "../src/modules/chat/chat-readiness.js";

describe("classifyChatProbeError", () => {
  it("maps missing refresh / AUTH_REQUIRED to needs_reconsent", () => {
    expect(classifyChatProbeError({ code: "AUTH_REQUIRED", message: "no token" })).toEqual({
      status: "needs_reconsent",
      reason: "AUTH_REQUIRED",
    } satisfies ChatReadiness);
  });

  it("maps invalid_grant to needs_reconsent", () => {
    expect(
      classifyChatProbeError({ message: "invalid_grant: Token has been expired or revoked" }),
    ).toMatchObject({ status: "needs_reconsent" });
  });

  it("maps insufficient scopes (classic string) to needs_reconsent", () => {
    expect(
      classifyChatProbeError({
        httpStatus: 403,
        message: "Request had insufficient authentication scopes",
      }),
    ).toMatchObject({ status: "needs_reconsent", reason: "INSUFFICIENT_SCOPES" });
  });

  it("maps ACCESS_TOKEN_SCOPE_INSUFFICIENT to needs_reconsent", () => {
    expect(
      classifyChatProbeError({
        httpStatus: 403,
        message: "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
      }),
    ).toMatchObject({ status: "needs_reconsent" });
  });

  it("maps explicit chat-not-enabled to chat_disabled", () => {
    expect(
      classifyChatProbeError({
        httpStatus: 403,
        message: "Google Chat is not enabled for the user",
      }),
    ).toMatchObject({ status: "chat_disabled" });
  });

  it("maps GCP API not enabled to error (not chat_disabled)", () => {
    expect(
      classifyChatProbeError({
        httpStatus: 403,
        message: "Google Chat API has not been used in project X before or it is disabled",
      }),
    ).toMatchObject({ status: "error" });
  });

  it("maps access not configured to error", () => {
    expect(
      classifyChatProbeError({
        httpStatus: 403,
        message: "Access Not Configured. Chat API has not been used in project",
      }),
    ).toMatchObject({ status: "error" });
  });

  it("maps bare 403 without chat/scope phrases to error (not chat_disabled)", () => {
    expect(
      classifyChatProbeError({
        httpStatus: 403,
        message: "PERMISSION_DENIED",
      }),
    ).toMatchObject({ status: "error" });
  });

  it("maps bare 404 to error (not chat_disabled)", () => {
    expect(
      classifyChatProbeError({
        httpStatus: 404,
        message: "Requested entity was not found.",
      }),
    ).toMatchObject({ status: "error" });
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL on bare 403/404 and GCP cases**

```bash
cd backend/apps/google-sync-service && bun run test -- tests/chat-readiness.test.ts
```

Expected: FAIL — current code maps bare 403/404 → `chat_disabled`.

- [ ] **Step 3: Implement classifier order**

Replace `classifyChatProbeError` in `chat-readiness.ts` with:

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

  if (
    (msg.includes("insufficient") && msg.includes("scope")) ||
    msg.includes("access_token_scope_insufficient") ||
    msg.includes("insufficient authentication scopes")
  ) {
    return { status: "needs_reconsent", reason: "INSUFFICIENT_SCOPES" };
  }

  if (
    msg.includes("chat is not enabled") ||
    msg.includes("not a chat user") ||
    msg.includes("google chat app") ||
    msg.includes("not enabled for the user")
  ) {
    return { status: "chat_disabled", reason: input.message };
  }

  if (
    msg.includes("has not been used") ||
    msg.includes("access not configured") ||
    msg.includes("api has not been used") ||
    (msg.includes("chat api") && msg.includes("disabled"))
  ) {
    return { status: "error", reason: input.message };
  }

  // Bare 403/404: do NOT default to chat_disabled
  return { status: "error", reason: input.message };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd backend/apps/google-sync-service && bun run test -- tests/chat-readiness.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/google-sync-service/src/modules/chat/chat-readiness.ts \
  backend/apps/google-sync-service/tests/chat-readiness.test.ts
git commit -m "$(cat <<'EOF'
fix(google-sync): tighten Chat readiness classifier

Avoid mapping bare 403/404 to chat_disabled; prefer scopes, explicit disabled, or error.
EOF
)"
```

---

### Task 2: Align identity `GOOGLE_OAUTH_SCOPES` with Flutter Chat scopes

**Files:**
- Modify: `backend/apps/identity-service/src/infra/google-oauth.ts`

- [ ] **Step 1: Update scopes constant**

Change the comment and array to:

```ts
/** Scope mặc định: đăng nhập + Tasks + Sheets/Drive.file + Chat (OAuth proxy). */
export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/chat.spaces.readonly",
  "https://www.googleapis.com/auth/chat.messages",
  "https://www.googleapis.com/auth/chat.memberships",
] as const;
```

Must match `frontend/lib/features/auth/data/google_sign_in_helper.dart` `kGoogleSyncScopes` (plus openid/email/profile on identity).

- [ ] **Step 2: Typecheck identity**

```bash
cd backend/apps/identity-service && bun run typecheck
```

Expected: PASS (or project’s equivalent script).

- [ ] **Step 3: Commit**

```bash
git add backend/apps/identity-service/src/infra/google-oauth.ts
git commit -m "$(cat <<'EOF'
fix(identity): include Google Chat scopes in default OAuth list

Keep web PKCE / server consent aligned with Flutter kGoogleSyncScopes.
EOF
)"
```

---

### Task 3: Stop silent Chat offline-auth failure on Relink paths

**Files:**
- Modify: `frontend/lib/features/auth/data/google_sign_in_helper.dart`
- Modify: `frontend/lib/features/auth/pages/link_google_page.dart`
- Modify: `frontend/lib/features/sync/pages/sync_tab_page.dart`
- Modify: `frontend/lib/features/shell/widgets/account_switcher.dart`

- [ ] **Step 1: Helper — require offline access when requested**

In `google_sign_in_helper.dart`, change `tokensFromGoogleAccount` and `requestGoogleSignInTokens`:

```dart
Future<GoogleSignInTokens> tokensFromGoogleAccount(
  GoogleSignInAccount account, {
  bool requireOfflineAccess = false,
}) async {
  final idToken = account.authentication.idToken;
  if (idToken == null || idToken.isEmpty) {
    throw StateError('Không lấy được Google idToken');
  }
  String? serverAuthCode;
  try {
    final serverAuth =
        await account.authorizationClient.authorizeServer(kGoogleSyncScopes);
    serverAuthCode = serverAuth?.serverAuthCode;
  } catch (e) {
    if (requireOfflineAccess) {
      throw StateError(
        'Không cấp được quyền Google offline (Tasks/Sheets/Chat). Thử lại hoặc kiểm tra OAuth consent.',
      );
    }
  }
  if (requireOfflineAccess &&
      (serverAuthCode == null || serverAuthCode.isEmpty)) {
    throw StateError(
      'Thiếu serverAuthCode — cần đồng ý đủ quyền Google (gồm Chat) rồi liên kết lại.',
    );
  }
  return GoogleSignInTokens(
    idToken: idToken,
    serverAuthCode: serverAuthCode,
  );
}

Future<GoogleSignInTokens> requestGoogleSignInTokens({
  bool requireOfflineAccess = false,
}) async {
  if (kIsWeb) {
    final result = await requestGoogleWebPopupAuth(
      clientId: EnvConfig.googleServerClientId,
      scopes: kGoogleSyncScopes,
    );
    if (requireOfflineAccess && result.serverAuthCode.isEmpty) {
      throw StateError(
        'Thiếu serverAuthCode — cần đồng ý đủ quyền Google (gồm Chat) rồi liên kết lại.',
      );
    }
    return GoogleSignInTokens(
      serverAuthCode: result.serverAuthCode,
      redirectUri: GoogleWebSignInResult.redirectUri,
    );
  }

  await ensureGoogleSignInInitialized();
  final account =
      await GoogleSignIn.instance.authenticate(scopeHint: kGoogleSyncScopes);
  return tokensFromGoogleAccount(
    account,
    requireOfflineAccess: requireOfflineAccess,
  );
}
```

Keep **login** calling `requestGoogleSignInTokens()` without require (optional offline). Relink paths use `true`.

- [ ] **Step 2: Wire Relink callers**

`link_google_page.dart` — where it calls `requestGoogleSignInTokens()`, use:

```dart
final tokens = await requestGoogleSignInTokens(requireOfflineAccess: true);
```

`sync_tab_page.dart` `_linkGoogle`:

```dart
final tokens = await requestGoogleSignInTokens(requireOfflineAccess: true);
```

`account_switcher.dart` `_linkGoogle`:

```dart
final tokens = await requestGoogleSignInTokens(requireOfflineAccess: true);
```

- [ ] **Step 3: Analyze (optional quick check)**

```bash
cd frontend && dart analyze lib/features/auth/data/google_sign_in_helper.dart \
  lib/features/auth/pages/link_google_page.dart \
  lib/features/sync/pages/sync_tab_page.dart \
  lib/features/shell/widgets/account_switcher.dart
```

Expected: no errors on these files.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/features/auth/data/google_sign_in_helper.dart \
  frontend/lib/features/auth/pages/link_google_page.dart \
  frontend/lib/features/sync/pages/sync_tab_page.dart \
  frontend/lib/features/shell/widgets/account_switcher.dart
git commit -m "$(cat <<'EOF'
fix(frontend): require Google offline auth on Relink paths

Surface missing serverAuthCode so Chat/Tasks refresh tokens are not silently skipped.
EOF
)"
```

---

### Task 4: Fix `spaceName` routing **only if** Task 0 proved `%2F` broken

**Skip this entire task** if Task 0 list/send via gateway with encoded path returned 200/201 JSON.

**Files (when required):**
- Modify: `backend/apps/google-sync-service/src/modules/chat/chat-proxy.controller.ts`
- Modify: `backend/apps/google-sync-service/src/modules/sync/sync.routes.ts`
- Modify: `frontend/lib/features/home/data/google_chat_repository.dart`

- [ ] **Step 1: Add query/body handlers (keep old routes for compat)**

In `chat-proxy.controller.ts` add:

```ts
export async function listMessagesByQuery(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const groupId = z.string().uuid().parse(req.query.groupId);
    const spaceName = z.string().min(3).parse(req.query.spaceName);
    const pageToken =
      typeof req.query.pageToken === "string" ? req.query.pageToken : undefined;
    const result = await listMessages(user.id, groupId, spaceName, pageToken);
    res.json(result);
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function sendMessageByBody(req: Request, res: Response): Promise<void> {
  try {
    const user = await requireUser(req);
    const body = z
      .object({
        groupId: z.string().uuid(),
        spaceName: z.string().min(3),
        text: z.string().min(1).max(8000),
      })
      .parse(req.body);
    const message = await sendMessage(user.id, body.groupId, body.spaceName, body.text);
    res.status(201).json({ message });
  } catch (err) {
    sendError(res, err, logger);
  }
}
```

In `sync.routes.ts` register **before** or alongside existing path routes:

```ts
syncRoutes.get("/sync/chat/messages", (req, res) =>
  void chatProxyController.listMessagesByQuery(req, res),
);
syncRoutes.post("/sync/chat/messages", (req, res) =>
  void chatProxyController.sendMessageByBody(req, res),
);
```

- [ ] **Step 2: Point Flutter repository at query/body APIs**

In `google_chat_repository.dart` `listMessages` / `sendMessage`:

```dart
  Future<({List<GoogleChatMessage> messages, String? nextPageToken})>
      listMessages({
    required String groupId,
    required String spaceName,
    String? pageToken,
  }) async {
    try {
      final res = await _api.dio.get<Map<String, dynamic>>(
        '/sync/chat/messages',
        queryParameters: {
          'groupId': groupId,
          'spaceName': spaceName,
          if (pageToken != null) 'pageToken': pageToken,
        },
      );
      // ... same parsing as today
```

```dart
  Future<void> sendMessage({
    required String groupId,
    required String spaceName,
    required String text,
  }) async {
    try {
      await _api.dio.post(
        '/sync/chat/messages',
        data: {'groupId': groupId, 'spaceName': spaceName, 'text': text},
      );
    } catch (e) {
      throw mapDioError(e);
    }
  }
```

- [ ] **Step 3: Re-smoke via gateway**

```bash
curl -sS -H "Authorization: Bearer $JWT" \
  "$GW/sync/chat/messages?groupId=$GROUP_ID&spaceName=$SPACE" | tee /tmp/chat-messages-q.json

curl -sS -X POST -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d "{\"groupId\":\"$GROUP_ID\",\"spaceName\":\"$SPACE\",\"text\":\"gap-close query smoke\"}" \
  "$GW/sync/chat/messages" | tee /tmp/chat-send-q.json
```

Expected: 200/201 with message payloads.

- [ ] **Step 4: Commit**

```bash
git add backend/apps/google-sync-service/src/modules/chat/chat-proxy.controller.ts \
  backend/apps/google-sync-service/src/modules/sync/sync.routes.ts \
  frontend/lib/features/home/data/google_chat_repository.dart
git commit -m "$(cat <<'EOF'
fix(chat): avoid encoded slash in Google Chat message URLs

Route list/send via query/body spaceName when gateway breaks spaces%2F paths.
EOF
)"
```

---

### Task 5: Runbook update

**Files:**
- Modify: `backend/docs/runbooks/google-chat-oauth-proxy.md`

- [ ] **Step 1: Rewrite/extend runbook**

Ensure the file includes at least:

1. Link to gap-close spec `docs/superpowers/specs/2026-09-30-google-chat-oauth-gap-close-design.md`  
2. Task 0 checklist (JWT owner = operator; GCP Chat API; gateway curls)  
3. Classifier meaning: `needs_reconsent` vs `chat_disabled` vs `error` (bare 403 ≠ chat_disabled)  
4. Poll semantics: ~10s while thread open; not a DB mirror  
5. Hard DoD = Workspace; soft = Gmail gate OK  
6. If Task 4 shipped: document `/sync/chat/messages` query/body; keep note about legacy encoded path  
7. Historical plan pointer: do not run 2026-09-29 unchecked boxes  

- [ ] **Step 2: Commit**

```bash
git add backend/docs/runbooks/google-chat-oauth-proxy.md
git commit -m "$(cat <<'EOF'
docs: expand Google Chat OAuth proxy runbook for gap-close

Add Task 0 smoke ownership, classifier notes, and Workspace vs Gmail DoD.
EOF
)"
```

---

### Task 6: Hard DoD verification (Workspace)

**Files:** none (manual + curl)

- [ ] **Step 1: Re-run Task 0 readiness + send/list after code fixes**

Expect `ready`, list messages, send message via gateway (path or query form).

- [ ] **Step 2: Manual Chrome (Workspace)**

1. Relink Google if needed (must not silently succeed without offline code)  
2. Chat tab: readiness gate clears  
3. Link ≥1 space (OWNER/ADMIN)  
4. Send text from app → visible in Google Chat  
5. Send from Google Chat → visible in app within ~15s (poll)  

- [ ] **Step 3: Soft Gmail note**

If a Gmail account is available: record `ready` **or** clean `chat_disabled` in runbook/PR notes. Do not block merge on Gmail pass.

- [ ] **Step 4: Final commit only if docs/notes added; otherwise done**

No empty commit.

---

## Spec coverage self-check

| Spec item | Task |
|-----------|------|
| Diagnose-first / Task 0 ownership | Task 0 |
| Classifier order + tests | Task 1 |
| Identity Chat scopes | Task 2 |
| Silent authorize / Relink | Task 3 |
| `%2F` / query-body fallback | Task 4 (conditional) |
| Poll honesty / Gmail soft / runbook | Task 5 |
| Hard Workspace DoD | Task 6 |
| No historical plan execution | Header + Task 5 |
| Leave/create-task only if broken | Out of plan unless Task 0 proves |

## Placeholder scan

No TBD/TODO steps; Task 4 explicitly skippable with criteria.
