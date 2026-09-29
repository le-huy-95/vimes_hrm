# Phase 6a AI Assistant UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ghép Trợ lý AI read-only (Phase 6a) vào Flutter: FAB + responsive panel/full-screen, SSE + JSON, thẻ link điều hướng nội bộ.

**Architecture:** Feature `features/ai/` (models, repository Dio+SSE, `AiBloc`, `AiChatView`). FAB + side panel trên `AppShell`. `AiRepository` + `AiBloc` provide ở `ManageTeamsApp`. Deep-link: `TasksFocusRequested`, `WorkspaceGroupSelected`, `ChatListOpenByIdRequested`.

**Tech Stack:** Flutter, flutter_bloc, Dio, `http` (SSE), Equatable, go_router, ColorSkin Vimes.

**Spec:** `frontend/docs/superpowers/specs/2026-09-29-phase-6a-ai-assistant-design.md`  
**API guide:** `frontend/docs/huong-dan-ghep-api-phase-6a.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `lib/features/ai/data/ai_models.dart` | `AiUsage`, `AiLink`, `AiChatResult`, `AiStreamEvent`, `AiChatMessage` |
| `lib/features/ai/data/ai_repository.dart` | `chat()` JSON; `chatStream()` SSE |
| `lib/features/ai/data/ai_sse_parser.dart` | Parse SSE lines → events (testable pure) |
| `lib/features/ai/bloc/ai_event.dart` | Events |
| `lib/features/ai/bloc/ai_state.dart` | States |
| `lib/features/ai/bloc/ai_bloc.dart` | Session + send SSE/JSON fallback |
| `lib/features/ai/widgets/ai_chat_view.dart` | Shared chat UI |
| `lib/features/ai/widgets/ai_link_chip.dart` | Link chip |
| `lib/features/ai/pages/ai_page.dart` | Full-screen `/ai` |
| `lib/features/shell/pages/app_shell.dart` | FAB + panel |
| `lib/app/app.dart` | DI `AiRepository` + `AiBloc` |
| `lib/app/router/app_router.dart` | `AppRoutes.ai`, redirect |
| `lib/features/tasks/bloc/*` | `TasksFocusRequested` + `focusTaskId` |
| `lib/features/chat/bloc/*` | `ChatListOpenByIdRequested` |
| `pubspec.yaml` | Add `http` |
| `test/features/ai/ai_models_test.dart` | Parse JSON |
| `test/features/ai/ai_sse_parser_test.dart` | SSE frames |

---

### Task 1: Dependency `http` + AI models + unit tests

**Files:**
- Modify: `frontend/pubspec.yaml`
- Create: `frontend/lib/features/ai/data/ai_models.dart`
- Create: `frontend/test/features/ai/ai_models_test.dart`

- [ ] **Step 1: Add `http` to pubspec**

Under `dependencies:` add:

```yaml
  http: ^1.2.2
```

Run: `cd frontend && flutter pub get`  
Expected: exit 0

- [ ] **Step 2: Write failing model tests**

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:manage_teams/features/ai/data/ai_models.dart';

void main() {
  test('AiChatResult.fromJson parses links and mock', () {
    final r = AiChatResult.fromJson({
      'sessionId': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      'answer': 'Hello',
      'links': [
        {
          'type': 'task',
          'id': 't1',
          'href': 'http://localhost:3000/groups/g1/tasks/T-1',
          'label': 'T-1: Open A',
        },
      ],
      'toolsUsed': ['list_my_tasks'],
      'mock': true,
      'provider': 'mock',
      'usage': {'promptTokens': 1, 'completionTokens': 2},
    });
    expect(r.sessionId, startsWith('aaaaaaaa'));
    expect(r.answer, 'Hello');
    expect(r.links.single.type, 'task');
    expect(r.links.single.id, 't1');
    expect(r.mock, isTrue);
    expect(r.usage.completionTokens, 2);
  });

  test('AiChatResult tolerates missing links/usage', () {
    final r = AiChatResult.fromJson({
      'sessionId': 's1',
      'answer': '',
    });
    expect(r.links, isEmpty);
    expect(r.mock, isTrue);
    expect(r.provider, 'mock');
  });
}
```

- [ ] **Step 3: Run test — expect FAIL (library missing)**

Run: `cd frontend && flutter test test/features/ai/ai_models_test.dart`  
Expected: FAIL (uri not found)

- [ ] **Step 4: Implement `ai_models.dart`**

```dart
class AiUsage {
  const AiUsage({required this.promptTokens, required this.completionTokens});
  final int promptTokens;
  final int completionTokens;

  factory AiUsage.fromJson(Map<String, dynamic> j) => AiUsage(
        promptTokens: (j['promptTokens'] as num?)?.toInt() ?? 0,
        completionTokens: (j['completionTokens'] as num?)?.toInt() ?? 0,
      );
}

class AiLink {
  const AiLink({
    required this.type,
    required this.id,
    required this.href,
    required this.label,
  });
  final String type;
  final String id;
  final String href;
  final String label;

  factory AiLink.fromJson(Map<String, dynamic> j) => AiLink(
        type: j['type'] as String,
        id: j['id'] as String,
        href: j['href'] as String? ?? '',
        label: j['label'] as String? ?? '',
      );
}

class AiChatResult {
  const AiChatResult({
    required this.sessionId,
    required this.answer,
    required this.links,
    required this.toolsUsed,
    required this.mock,
    required this.provider,
    required this.usage,
  });

  final String sessionId;
  final String answer;
  final List<AiLink> links;
  final List<String> toolsUsed;
  final bool mock;
  final String provider;
  final AiUsage usage;

  factory AiChatResult.fromJson(Map<String, dynamic> j) => AiChatResult(
        sessionId: j['sessionId'] as String,
        answer: j['answer'] as String? ?? '',
        links: (j['links'] as List? ?? [])
            .whereType<Map>()
            .map((e) => AiLink.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
        toolsUsed: (j['toolsUsed'] as List? ?? []).map((e) => '$e').toList(),
        mock: j['mock'] as bool? ?? true,
        provider: j['provider'] as String? ?? 'mock',
        usage: AiUsage.fromJson(
          Map<String, dynamic>.from(j['usage'] as Map? ?? const {}),
        ),
      );
}

class AiStreamEvent {
  const AiStreamEvent({required this.event, required this.data});
  final String event;
  final Map<String, dynamic> data;
}

enum AiMessageRole { user, assistant }

class AiChatMessage {
  const AiChatMessage({
    required this.role,
    required this.text,
    this.links = const [],
  });
  final AiMessageRole role;
  final String text;
  final List<AiLink> links;

  AiChatMessage copyWith({String? text, List<AiLink>? links}) => AiChatMessage(
        role: role,
        text: text ?? this.text,
        links: links ?? this.links,
      );
}
```

- [ ] **Step 5: Run tests — PASS**

Run: `cd frontend && flutter test test/features/ai/ai_models_test.dart`  
Expected: All tests passed

- [ ] **Step 6: Commit**

```bash
git add frontend/pubspec.yaml frontend/pubspec.lock frontend/lib/features/ai/data/ai_models.dart frontend/test/features/ai/ai_models_test.dart
git commit -m "feat(frontend): add Phase 6a AI models and http dependency"
```

---

### Task 2: SSE parser + tests

**Files:**
- Create: `frontend/lib/features/ai/data/ai_sse_parser.dart`
- Create: `frontend/test/features/ai/ai_sse_parser_test.dart`

- [ ] **Step 1: Write failing parser test**

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:manage_teams/features/ai/data/ai_sse_parser.dart';

void main() {
  test('parseSseChunk yields meta then token then links then done', () {
    const raw = '''
event: meta
data: {"sessionId":"s1","mock":true,"provider":"mock"}

event: token
data: {"text":"Hi"}

event: links
data: {"links":[{"type":"task","id":"t1","href":"/x","label":"T-1"}]}

event: done
data: {}

''';
    final events = <AiStreamEvent>[];
    final buf = SseParserBuffer();
    events.addAll(buf.addChunk(raw));
    expect(events.map((e) => e.event), ['meta', 'token', 'links', 'done']);
    expect(events[1].data['text'], 'Hi');
    expect((events[2].data['links'] as List).length, 1);
  });
}
```

(Import `AiStreamEvent` from `ai_models.dart` in parser.)

- [ ] **Step 2: Implement `SseParserBuffer`**

```dart
import 'dart:convert';
import 'package:manage_teams/features/ai/data/ai_models.dart';

class SseParserBuffer {
  String? _event;
  final StringBuffer _data = StringBuffer();
  String _carry = '';

  List<AiStreamEvent> addChunk(String chunk) {
    final out = <AiStreamEvent>[];
    final text = _carry + chunk;
    _carry = '';
    final lines = text.split('\n');
    if (!text.endsWith('\n')) {
      _carry = lines.removeLast();
    }
    for (final line in lines) {
      final trimmed = line.endsWith('\r') ? line.substring(0, line.length - 1) : line;
      if (trimmed.startsWith('event:')) {
        _event = trimmed.substring(6).trim();
      } else if (trimmed.startsWith('data:')) {
        _data.writeln(trimmed.substring(5).trim());
      } else if (trimmed.isEmpty && _event != null) {
        final raw = _data.toString().trim();
        _data.clear();
        final map = raw.isEmpty
            ? <String, dynamic>{}
            : jsonDecode(raw) as Map<String, dynamic>;
        out.add(AiStreamEvent(event: _event!, data: map));
        _event = null;
      }
    }
    return out;
  }
}
```

- [ ] **Step 3: Run test — PASS**

Run: `cd frontend && flutter test test/features/ai/ai_sse_parser_test.dart`

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/features/ai/data/ai_sse_parser.dart frontend/test/features/ai/ai_sse_parser_test.dart
git commit -m "feat(frontend): add AI SSE frame parser"
```

---

### Task 3: `AiRepository` (JSON + SSE)

**Files:**
- Create: `frontend/lib/features/ai/data/ai_repository.dart`

- [ ] **Step 1: Implement repository**

```dart
import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:http/http.dart' as http;
import 'package:manage_teams/core/constants/env_config.dart';
import 'package:manage_teams/core/network/api_client.dart';
import 'package:manage_teams/features/ai/data/ai_models.dart';
import 'package:manage_teams/features/ai/data/ai_sse_parser.dart';

class AiRepository {
  AiRepository(this._api, {http.Client? httpClient})
      : _http = httpClient ?? http.Client();

  final ApiClient _api;
  final http.Client _http;

  Future<AiChatResult> chat({
    required String message,
    String? sessionId,
  }) async {
    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/ai/chat',
        data: {
          'message': message,
          if (sessionId != null) 'sessionId': sessionId,
        },
        options: Options(
          receiveTimeout: const Duration(seconds: 60),
          sendTimeout: const Duration(seconds: 15),
        ),
      );
      return AiChatResult.fromJson(res.data!);
    } catch (e) {
      throw mapDioError(e);
    }
  }

  Stream<AiStreamEvent> chatStream({
    required String message,
    String? sessionId,
  }) async* {
    final token = await _api.tokenStore.getAccessToken();
    final base = EnvConfig.baseUrl.replaceAll(RegExp(r'/$'), '');
    final req = http.Request('POST', Uri.parse('$base/ai/chat/stream'));
    req.headers.addAll({
      'content-type': 'application/json',
      'accept': 'text/event-stream',
      if (token != null && token.isNotEmpty) 'authorization': 'Bearer $token',
    });
    req.body = jsonEncode({
      'message': message,
      if (sessionId != null) 'sessionId': sessionId,
    });

    final res = await _http.send(req).timeout(const Duration(seconds: 60));
    if (res.statusCode >= 400) {
      final body = await res.stream.bytesToString();
      throw _parseHttpError(body, res.statusCode);
    }

    final parser = SseParserBuffer();
    await for (final chunk in res.stream.transform(utf8.decoder)) {
      for (final ev in parser.addChunk(chunk)) {
        yield ev;
      }
    }
  }

  ApiException _parseHttpError(String body, int status) {
    try {
      final data = jsonDecode(body);
      if (data is Map) {
        final message = data['message']?.toString();
        final code = data['error']?.toString();
        if (message != null && message.isNotEmpty) {
          return ApiException(message, code: code, statusCode: status);
        }
      }
    } catch (_) {}
    return ApiException('Lỗi AI ($status)', statusCode: status);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/features/ai/data/ai_repository.dart
git commit -m "feat(frontend): add AiRepository JSON chat and SSE stream"
```

---

### Task 4: `AiBloc` (events/states)

**Files:**
- Create: `frontend/lib/features/ai/bloc/ai_event.dart`
- Create: `frontend/lib/features/ai/bloc/ai_state.dart`
- Create: `frontend/lib/features/ai/bloc/ai_bloc.dart`

- [ ] **Step 1: Events**

```dart
sealed class AiEvent extends Equatable { ... }
class AiStarted extends AiEvent { const AiStarted(); }
class AiMessageSent extends AiEvent {
  const AiMessageSent(this.message);
  final String message;
}
class AiNewChatRequested extends AiEvent { const AiNewChatRequested(); }
class AiRetryRequested extends AiEvent { const AiRetryRequested(); }
class AiLinkTapped extends AiEvent {
  const AiLinkTapped(this.link);
  final AiLink link;
}
```

- [ ] **Step 2: State `AiReady`**

Fields: `sessionId` (String?), `messages` (`List<AiChatMessage>`), `sending` (bool), `mock` (bool?), `banner` (String?), `lastError` (String?), `lastFailedMessage` (String? for retry), `pendingLink` (`AiLink?` — set on tap for UI to navigate then clear).

- [ ] **Step 3: Bloc send flow**

1. Append user message; set `sending=true`; clear error.
2. Try `chatStream`: on `meta` save sessionId/mock; on `token` update last assistant text (create assistant bubble if needed); on `links` attach; on `done` `sending=false`; on `error` event set error.
3. On stream failure mid-flight: if no assistant text yet, fallback once to `chat()` JSON; else set `lastError` + keep `lastFailedMessage`.
4. `AiNewChatRequested`: clear session + messages + errors.
5. Map `ApiException.code`: `NOT_FOUND` → clear session + banner “Đã mở chat mới”; `RATE_LIMIT` / `AI_BUDGET` / … → user-facing Vietnamese messages from guide §12.
6. `AiLinkTapped`: emit `pendingLink` for listener (shell/page navigates).

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/features/ai/bloc/
git commit -m "feat(frontend): add AiBloc with SSE-first send and JSON fallback"
```

---

### Task 5: Deep-link hooks (Tasks + Chat)

**Files:**
- Modify: `frontend/lib/features/tasks/bloc/tasks_event.dart`
- Modify: `frontend/lib/features/tasks/bloc/tasks_state.dart`
- Modify: `frontend/lib/features/tasks/bloc/tasks_bloc.dart`
- Modify: `frontend/lib/features/tasks/pages/tasks_tab_page.dart` (highlight `focusTaskId`)
- Modify: `frontend/lib/features/chat/bloc/chat_list_event.dart`
- Modify: `frontend/lib/features/chat/bloc/chat_list_bloc.dart`

- [ ] **Step 1: `TasksFocusRequested(String taskId)`**

In `TasksBloc`: switch to list view if needed; set `focusTaskId` on `TasksReady`; clear filter or set filter to matching task’s status so task visible.

In `TasksTabPage`: when `focusTaskId != null`, scroll/highlight matching card (border `ColorSkin.primary`); clear focus after ~2s via event `TasksFocusCleared` or `copyWith(clearFocus: true)`.

- [ ] **Step 2: `ChatListOpenByIdRequested(String conversationId)`**

Find in `groupConversations` or `taskConversations`; if found emit select; else snackbar via failure or leave UI to show snackbar from AI listener.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/features/tasks frontend/lib/features/chat
git commit -m "feat(frontend): focus task and open conversation by id for AI links"
```

---

### Task 6: UI — `AiChatView`, chips, `AiPage`

**Files:**
- Create: `frontend/lib/features/ai/widgets/ai_link_chip.dart`
- Create: `frontend/lib/features/ai/widgets/ai_chat_view.dart`
- Create: `frontend/lib/features/ai/pages/ai_page.dart`

- [ ] **Step 1: `AiLinkChip`** — InkWell chip; icon by type (`task`/`group`/`conversation`); onTap → `AiLinkTapped`.

- [ ] **Step 2: `AiChatView`**

- Suggestion chips when messages empty.
- ListView bubbles + links under assistant.
- Composer TextField + send; disable when sending.
- Banner for `banner` / error row with Retry → `AiRetryRequested`.
- Optional Mock badge via `state.mock`.

- [ ] **Step 3: `AiPage`** — Scaffold AppBar (back, title, Chat mới, Mock badge) + `AiChatView` + BlocListener for errors/snackbar + link navigation helper.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/features/ai/widgets frontend/lib/features/ai/pages
git commit -m "feat(frontend): add AI chat view and full-screen page"
```

---

### Task 7: Shell FAB + side panel + router + DI

**Files:**
- Modify: `frontend/lib/app/app.dart`
- Modify: `frontend/lib/app/router/app_router.dart`
- Modify: `frontend/lib/features/shell/pages/app_shell.dart`
- Create helper (optional): `frontend/lib/features/ai/ai_navigation.dart` — `void handleAiLink(BuildContext, AiLink)` closes panel callback, then navigates.

- [ ] **Step 1: DI in `app.dart`**

```dart
late final AiRepository _aiRepo = AiRepository(_api);
late final AiBloc _aiBloc = AiBloc(_aiRepo);

// In MultiRepositoryProvider: RepositoryProvider.value(value: _aiRepo),
// Wrap with MultiBlocProvider: AuthBloc + AiBloc
// On logout: _aiBloc.add(const AiNewChatRequested());
```

- [ ] **Step 2: Router**

Add `AppRoutes.ai('/ai')`. In redirect `isAppRoute` include `/ai`. Add `GoRoute` for `/ai` → `AiPage` (sibling of shell, authenticated).

- [ ] **Step 3: `AppShell`**

- State `_aiPanelOpen`.
- FAB: if `width >= 900` toggle panel; else `context.push('/ai')`.
- Stack body: `navigationShell` + if panel open, right `Material` width 400 with header + `AiChatView`.
- Wire link listener: close panel, call navigation helper.

**Navigation helper logic:**

| type | action |
|------|--------|
| task | `context.go('/tasks'); context.read<TasksBloc>().add(TasksFocusRequested(id));` |
| group | if in workspace → `WorkspaceGroupSelected` + `go('/home')`; else snackbar |
| conversation | `go('/chat'); ChatListOpenByIdRequested(id)` |

Note: `TasksBloc` / `ChatListBloc` / `WorkspaceBloc` live under shell — from `AiPage` (sibling) they may be **unavailable**. For `/ai` full-screen: prefer `context.go` + pass extra, **or** keep deep-link handling only when blocs are in tree (panel + after popping back).  

**Resolved approach:** Register deep-link handling in a small `AiLinkNavigator` that uses `GoRouter` extras:

- `context.go('/tasks', extra: {'focusTaskId': id})`
- Tasks route builder / `TasksTabPage` reads extra once via `GoRouterState` **or** shell listens to a `AiBloc` `pendingLink` while shell is mounted.

Simplest reliable: **`AiBloc.pendingLink` cleared by `AppShell` listener always mounted** (indexed stack keeps shell under `/ai` if `/ai` is pushed on root — actually sibling replaces?).  

With go_router sibling `/ai`, shell is disposed from tree. So:

**Use `parentNavigatorKey` root push from shell** so shell stays under:

```dart
// In shell FAB mobile:
Navigator.of(context, rootNavigator: true).push(
  MaterialPageRoute(builder: (_) => BlocProvider.value(
    value: context.read<AiBloc>(),
    child: const AiPage(),
  )),
);
```

Avoid separate `/ai` go_router route **OR** keep `/ai` but lift Workspace/Tasks/Chat blocs higher (too heavy).

**Plan decision (lock):** Mobile opens AI via **`Navigator.push` MaterialPageRoute** with `BlocProvider.value(AiBloc)` from shell (shell stays alive → deep-links work). Still add `/ai` go_router route that wraps `AiPage` for deep links/web bookmarks; deep-link from that page uses `context.go` + `extra` maps that Tasks/Chat pages consume on `didChangeDependencies` / `GoRouterState.uri`.

Minimal path for 6a: **FAB mobile = Navigator.push from shell** (no go_router `/ai` required for MVP). Spec asked `/ai` — add go_router route that also works; TasksTabPage accepts optional `focusTaskId` from `state.extra`.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/app frontend/lib/features/shell frontend/lib/features/ai
git commit -m "feat(frontend): wire AI FAB, side panel, DI, and routes"
```

---

### Task 8: Verify

- [ ] **Step 1:** `cd frontend && flutter test test/features/ai/`
- [ ] **Step 2:** `cd frontend && dart analyze lib/features/ai lib/features/shell/pages/app_shell.dart lib/app/app.dart lib/app/router/app_router.dart`
- [ ] **Step 3:** Manual smoke (if API up): FAB → ask “Việc nào của tôi đang mở? Cho link” → tap task link.

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| FAB all tabs | 7 |
| Responsive panel / full | 7 |
| SSE + JSON fallback | 3–4 |
| AiBloc app-level lifecycle | 7 |
| Chat UI + suggestions + Mock | 6 |
| Link chips + deep-link | 5–7 |
| Error mapping | 4 |
| No 6b–6e / no internal | N/A (omitted) |
| Unit tests models/SSE | 1–2 |
| TasksFocusRequested | 5 |
