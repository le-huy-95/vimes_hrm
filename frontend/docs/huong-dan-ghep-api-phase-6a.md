# Hướng dẫn ghép API Phase 6a (AI read-only) vào Flutter

Tài liệu mô tả **đúng theo backend hiện tại** (`api-gateway` → `ai-service` Phase 6a deepen), để Flutter ghép **trợ lý AI chỉ đọc + thẻ link thực thể**.

**Tiền đề:** đã ghép Auth + task/group theo  
[`huong-dan-ghep-api-phase-1-3.md`](./huong-dan-ghep-api-phase-1-3.md).

**Backend spec / runbook:**  
[`docs/superpowers/specs/2026-09-28-phase-6a-deepen-design.md`](../../docs/superpowers/specs/2026-09-28-phase-6a-deepen-design.md) ·  
[`backend/docs/runbooks/phase-6a-deepen.md`](../../backend/docs/runbooks/phase-6a-deepen.md)

---

## Mục lục

1. [Tổng quan Phase 6a](#1-tổng-quan-phase-6a)
2. [Proxy, auth, nội bộ](#2-proxy-auth-nội-bộ)
3. [Cấu hình Flutter](#3-cấu-hình-flutter)
4. [Token, header, lỗi chung](#4-token-header-lỗi-chung)
5. [POST /ai/chat (JSON)](#5-post-aichat-json)
6. [POST /ai/chat/stream (SSE)](#6-post-aichatstream-sse)
7. [POST /ai/ping (smoke)](#7-post-aiping-smoke)
8. [Link entity → điều hướng Flutter](#8-link-entity--điều-hướng-flutter)
9. [Luồng UI gợi ý](#9-luồng-ui-gợi-ý)
10. [Model Dart gợi ý](#10-model-dart-gợi-ý)
11. [Repository / Dio / SSE mẫu](#11-repository--dio--sse-mẫu)
12. [Bảng mã lỗi](#12-bảng-mã-lỗi)
13. [Việc Flutter không làm (6b–6e)](#13-việc-flutter-không-làm-6b6e)
14. [Checklist ghép Flutter](#14-checklist-ghép-flutter)

---

## 1. Tổng quan Phase 6a

### 1.1 Backend làm gì / Flutter làm gì

| | Backend (`ai-service`) | Flutter |
|--|------------------------|---------|
| **Có** | Hỏi đáp **chỉ đọc**; gọi tool task/group/member/sync; **link resolver** theo quyền; SSE; rate-limit / budget | Màn chat AI; gửi câu hỏi; hiện `answer` + thẻ `links`; mở deep-link trong app; giữ `sessionId` |
| **Không** | Tạo/sửa/xoá task thay user (6b hoãn) | Không gọi `/internal/*`; không tự “bịa” URL |

### 1.2 Hành vi quyền (nghiệm thu)

1. User hỏi *“Việc nào của tôi đang mở? Cho link”* → danh sách việc **đang mở** (status `TODO` / `IN_PROGRESS`) + link app.
2. User A **không** thấy dữ liệu / link nhóm B nếu không còn membership ACTIVE.
3. Mọi phần tử trong `links[]` đã được server verify — Flutter **tin** `href` / `type`+`id` từ server, không parse bịa thêm entity.

### 1.3 Mock vs LLM thật

| `provider` trong response | Ý nghĩa UI |
|---------------------------|------------|
| `mock` | Dev / không API key — vẫn có tools + links đúng quyền |
| `anthropic` / `openai` | Backend đang dùng LLM thật (Flutter **không** cần key) |

Flutter có thể hiện badge nhỏ “Mock” khi `mock == true` (tuỳ sản phẩm).

**Schema hiện tại không có due date task** → câu kiểu “sắp trễ hạn tuần này” backend map sang việc **đang mở**, không phải deadline thật.

---

## 2. Proxy, auth, nội bộ

### 2.1 Gateway

| Path | Upstream | Port |
|------|----------|------|
| `/ai/*` | ai-service | `3205` |

Flutter **chỉ** gọi `API_*_URL` → gateway `:3200` (Android emulator: `http://10.0.2.2:3200`).

### 2.2 JWT vs internal

| Path | Auth | Flutter |
|------|------|---------|
| `POST /ai/chat` | Bearer JWT | **Gọi** |
| `POST /ai/chat/stream` | Bearer JWT | **Gọi** (SSE) |
| `POST /ai/ping` | Không bắt buộc JWT (smoke) | Tuỳ chọn |
| `GET /ai/admin/ops` | JWT + platform admin (6d stub) | **Chưa** cần cho 6a user |
| `POST /internal/ai/*` | `x-internal-token` | **Không** (gateway không proxy `/internal`) |

---

## 3. Cấu hình Flutter

### 3.1 `.env` (giữ như Phase 1–3)

```env
APP_ENV=dev
API_DEV_URL=http://localhost:3200
API_PROD_URL=http://localhost:3200
```

Không cần env Anthropic/OpenAI trên Flutter — key nằm backend.

### 3.2 Timeout

Backend `AI_CHAT_TIMEOUT_MS` mặc định **30s**. Dio mặc định `receiveTimeout: 30s` có thể sát ngưỡng.

**Gợi ý:** request AI dùng timeout riêng **45–60s**:

```dart
Options(
  receiveTimeout: const Duration(seconds: 60),
  sendTimeout: const Duration(seconds: 15),
)
```

---

## 4. Token, header, lỗi chung

### 4.1 Header

```http
Content-Type: application/json
Authorization: Bearer <accessToken>
```

Dùng `ApiClient` hiện có (interceptor gắn Bearer).

### 4.2 Envelope lỗi

```json
{
  "error": "RATE_LIMIT",
  "message": "Quá nhiều yêu cầu AI. Thử lại sau."
}
```

Map bằng `mapDioError` như các phase trước: đọc `error` + `message`.

---

## 5. POST /ai/chat (JSON)

**Khuyến nghị MVP:** dùng endpoint này trước (đơn giản); SSE (§6) khi cần streaming UX.

### 5.1 Request

```http
POST /ai/chat
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "message": "Việc nào của tôi đang mở? Cho link",
  "sessionId": "optional-uuid"
}
```

| Field | Bắt buộc | Rule (Zod) |
|-------|----------|------------|
| `message` | Có | `string` min 1, max **4000** |
| `sessionId` | Không | UUID; phải thuộc **cùng user** |

- Lần đầu: **không** gửi `sessionId` → server tạo session, trả `sessionId`.
- Lượt sau trong cùng khung chat: gửi lại `sessionId` để gom audit (Phase 6a **chưa** lưu lịch sử hội thoại đầy đủ cho LLM — mỗi request vẫn độc lập về context model).

### 5.2 Response 200

```json
{
  "sessionId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "answer": "Tìm thấy kết quả trong quyền của bạn (list_my_tasks).",
  "links": [
    {
      "type": "task",
      "id": "task-uuid",
      "href": "http://localhost:3000/groups/group-uuid/tasks/T-1",
      "label": "T-1: Open A"
    }
  ],
  "toolsUsed": ["list_my_tasks"],
  "mock": true,
  "provider": "mock",
  "usage": { "promptTokens": 0, "completionTokens": 0 }
}
```

| Field | Kiểu | Flutter dùng |
|-------|------|--------------|
| `sessionId` | `string` UUID | Lưu state màn AI |
| `answer` | `string` | Bubble trả lời |
| `links` | `AiLink[]` | Thẻ bấm → điều hướng (§8) |
| `toolsUsed` | `string[]` | Debug / “Đã tra cứu …” (tuỳ chọn) |
| `mock` | `bool` | Badge Mock |
| `provider` | `mock` \| `anthropic` \| `openai` | Debug / settings |
| `usage` | `{ promptTokens, completionTokens }` | Tuỳ chọn; mock thường `0` |

### 5.3 Ví dụ câu hỏi (mock planner)

| User hỏi | Tool thường chạy |
|----------|------------------|
| Việc đang mở / todo / cho link | `list_my_tasks` |
| Khối lượng / tóm tắt / workload | `workload_summary` |
| Đồng bộ Google / sync | `sync_status` |
| Câu khác | Mặc định `list_my_tasks` |

LLM thật (khi backend có key) có thể gọi thêm `get_task`, `get_group`, `list_members`, … — Flutter chỉ cần render `answer` + `links`.

---

## 6. POST /ai/chat/stream (SSE)

Cùng body như `/ai/chat`. Response:

```http
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

### 6.1 Thứ tự event (ổn định)

| `event` | `data` (JSON) | Việc Flutter |
|---------|---------------|--------------|
| `meta` | `{ sessionId, mock, provider }` | Lưu session; hiện typing / badge |
| `token` | `{ text }` | Append / set nội dung trả lời (hiện tại thường **một** chunk cả câu) |
| `links` | `{ links: AiLink[] }` | Render thẻ link |
| `done` | `{}` | Kết thúc loading |
| `error` | (nếu có) | Hiện lỗi, dừng stream |

Định dạng khung SSE:

```
event: meta
data: {"sessionId":"...","mock":true,"provider":"mock"}

event: token
data: {"text":"..."}

event: links
data: {"links":[...]}

event: done
data: {}
```

### 6.2 Lưu ý client

- Dùng `http` / `dio` với response stream, **không** parse như JSON một phát.
- Giữ Bearer trên request POST.
- Nếu lỗi **trước** khi mở stream (401/429), body vẫn là JSON error envelope thường.
- Phase 6a deepen: token thường gửi **một lần** cả `answer` (chưa stream từng chữ từ Anthropic). UI vẫn có thể animate fade-in.

---

## 7. POST /ai/ping (smoke)

```http
POST /ai/ping
Content-Type: application/json

{ "hello": 1 }
```

```json
{ "ok": true, "echo": { "hello": 1 }, "service": "ai-service" }
```

Dùng kiểm tra gateway → AI khi onboard; **không** phải chat.

---

## 8. Link entity → điều hướng Flutter

Server dựng `href` từ `APP_PUBLIC_URL` (web). App mobile **nên ưu tiên** `type` + `id` (+ parse path nếu cần), không mở browser bừa.

| `type` | `href` mẫu | Điều hướng Flutter gợi ý |
|--------|------------|---------------------------|
| `task` | `/groups/{groupId}/tasks/{code}` | Màn task detail / Tasks tab filter theo `code` hoặc `id` |
| `group` | `/groups/{id}` | Màn nhóm / chọn workspace group |
| `conversation` | `/conversations/{id}` | Mở thread chat đã có (Phase 1.5) |

**Quy tắc:**

1. Chỉ mở entity có trong `links[]` lần response đó.
2. Nếu route nội bộ chưa hỗ trợ `code` mà chỉ có `id` — dùng `id` từ JSON (đáng tin hơn parse `href`).
3. `href` đầy đủ có thể dùng cho “Mở trên web” nếu có web build cùng path.

Parse `groupId` / `code` từ `href` (fallback):

```dart
// .../groups/<groupId>/tasks/<code>
final re = RegExp(r'/groups/([^/]+)/tasks/([^/?#]+)');
final m = re.firstMatch(href);
```

---

## 9. Luồng UI gợi ý

### 9.1 Màn “Trợ lý AI” (một composition)

1. Ô nhập câu hỏi + nút Gửi (disable khi đang chờ).
2. Danh sách tin: user bubble + assistant bubble (`answer`).
3. Dưới assistant: list chip/card từ `links` (label bấm được).
4. Giữ `sessionId` trong Cubit/Bloc đến khi user “Chat mới” → clear `sessionId`.

### 9.2 Trạng thái

| State | UI |
|-------|-----|
| Idle | Placeholder gợi ý: “Việc nào của tôi đang mở?” |
| Loading | Indicator; có thể hiện “Đang tra cứu…” |
| Success | `answer` + links |
| `RATE_LIMIT` / `AI_BUDGET` | Snackbar / banner chờ rồi thử lại |
| `UNAUTHORIZED` | Refresh token / về login (như phase khác) |
| Timeout / `AI_TIMEOUT` / `AI_PROVIDER` | “AI tạm không trả lời được” |

### 9.3 Không làm trong 6a

- Nút “Tạo task giúp tôi” / xác nhận hành động ghi (6b).
- Tìm ngữ nghĩa tin nhắn như search chat (6c — khác endpoint).
- Admin ops AI (6d).

---

## 10. Model Dart gợi ý

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
  final String type; // task | group | conversation | …
  final String id;
  final String href;
  final String label;

  factory AiLink.fromJson(Map<String, dynamic> j) => AiLink(
        type: j['type'] as String,
        id: j['id'] as String,
        href: j['href'] as String,
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
```

---

## 11. Repository / Dio / SSE mẫu

### 11.1 JSON chat (Dio)

```dart
class AiRepository {
  AiRepository(this._api);
  final ApiClient _api;

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
        options: Options(receiveTimeout: const Duration(seconds: 60)),
      );
      return AiChatResult.fromJson(res.data!);
    } catch (e) {
      throw mapDioError(e);
    }
  }
}
```

### 11.2 SSE (gợi ý dùng package `http`)

```dart
import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

Stream<AiStreamEvent> chatStream({
  required String baseUrl,
  required String accessToken,
  required String message,
  String? sessionId,
}) async* {
  final req = http.Request('POST', Uri.parse('$baseUrl/ai/chat/stream'));
  req.headers.addAll({
    'content-type': 'application/json',
    'authorization': 'Bearer $accessToken',
    'accept': 'text/event-stream',
  });
  req.body = jsonEncode({
    'message': message,
    if (sessionId != null) 'sessionId': sessionId,
  });

  final res = await req.send();
  if (res.statusCode >= 400) {
    final body = await res.stream.bytesToString();
    // parse JSON error envelope nếu có
    throw ApiException(body, statusCode: res.statusCode);
  }

  String? event;
  final dataBuf = StringBuffer();

  await for (final chunk in res.stream.transform(utf8.decoder)) {
    for (final line in chunk.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        dataBuf.writeln(line.substring(5).trim());
      } else if (line.isEmpty && event != null) {
        final raw = dataBuf.toString().trim();
        dataBuf.clear();
        final map = raw.isEmpty
            ? <String, dynamic>{}
            : jsonDecode(raw) as Map<String, dynamic>;
        yield AiStreamEvent(event: event!, data: map);
        event = null;
      }
    }
  }
}

class AiStreamEvent {
  AiStreamEvent({required this.event, required this.data});
  final String event;
  final Map<String, dynamic> data;
}
```

Ghép UI: `meta` → lưu session; `token` → set text; `links` → parse list; `done` → stop loading.

---

## 12. Bảng mã lỗi

| HTTP | `error` | Khi nào | UI |
|------|---------|---------|-----|
| 400 | `VALIDATION` | `message` rỗng / quá dài / `sessionId` không UUID | Hiện message / details Zod |
| 401 | `UNAUTHORIZED` | Thiếu/sai JWT (gateway) | Refresh / login |
| 404 | `NOT_FOUND` | `sessionId` không tồn tại hoặc **không thuộc user** | Clear session, tạo chat mới |
| 429 | `RATE_LIMIT` | Quá số câu/phút (`AI_RATE_LIMIT_PER_MIN`, mặc định 10) | Chờ ~1 phút |
| 429 | `AI_BUDGET` | Hết ngân sách token/ngày | Báo hết hạn mức ngày |
| 502 | `AI_PROVIDER` | LLM fail và `AI_REQUIRE_LLM=true` | Thử lại sau |
| 504 | `AI_TIMEOUT` | Quá `AI_CHAT_TIMEOUT_MS` | Thử lại / rút ngắn câu |
| 502 | `BAD_GATEWAY` | ai-service chết | Báo server AI |

Rate-limit AI nằm trên **ai-service** (sau JWT), cộng thêm rate-limit chung gateway nếu có.

---

## 13. Việc Flutter không làm (6b–6e)

| Phase | Nội dung | Flutter 6a |
|-------|----------|------------|
| **6b** | Tool ghi + thẻ xác nhận | **Chưa** — không thiết kế nút Confirm action |
| **6c** | Semantic search tin/file | Không dùng `/internal/ai/index-message` |
| **6d** | Admin ops AI | Có thể bỏ qua `GET /ai/admin/ops` |
| **6e** | Google Chat @bot / digest | Server/worker; không phải màn Flutter chính |

---

## 14. Checklist ghép Flutter

- [ ] `AiRepository.chat` gọi `POST /ai/chat` với Bearer + timeout ≥ 45s  
- [ ] Parse `AiChatResult`; lưu `sessionId` trong state  
- [ ] Render `answer` + list `links`; tap link → route nội bộ theo `type`/`id`  
- [ ] “Chat mới” xoá `sessionId`  
- [ ] Map lỗi `RATE_LIMIT`, `AI_BUDGET`, `NOT_FOUND`, `VALIDATION`, `UNAUTHORIZED`  
- [ ] (Tuỳ chọn) Badge khi `mock == true`  
- [ ] (Tuỳ chọn) `POST /ai/chat/stream` + parser SSE theo thứ tự meta → token → links → done  
- [ ] Không gửi / không phụ thuộc API key LLM phía client  
- [ ] Không gọi `/internal/ai/*`  
- [ ] Smoke: câu “Việc nào của tôi đang mở? Cho link” trả link task thuộc user  

---

## Phụ lục — curl nhanh

```bash
# JSON
curl -s -X POST "$API/ai/chat" \
  -H "Authorization: Bearer $ACCESS_JWT" \
  -H 'content-type: application/json' \
  -d '{"message":"Việc nào của tôi đang mở? Cho link"}'

# SSE
curl -N -X POST "$API/ai/chat/stream" \
  -H "Authorization: Bearer $ACCESS_JWT" \
  -H 'content-type: application/json' \
  -H 'accept: text/event-stream' \
  -d '{"message":"Việc nào của tôi đang mở? Cho link"}'
```

`$API` = `http://localhost:3200` (qua gateway).
