# Design: Ghép API Phase 6a — Trợ lý AI read-only (Flutter)

**Ngày:** 2026-09-29  
**Phạm vi:** Frontend Flutter — màn Trợ lý AI chỉ đọc + thẻ link thực thể theo `huong-dan-ghep-api-phase-6a.md`.  
**Tiền đề:** Auth + Phase 1–3 đã ghép; Sync Phase 4–5 theo spec riêng.  
**State management:** **BLoC only** (không Cubit).  
**Theme:** Giữ Vimes (`ColorSkin` primary `#0E7C86`, `tealLight`, BeVietnamPro, shared widgets).

---

## 1. Quyết định đã chốt

| Chủ đề | Quyết định |
|--------|------------|
| Entry | **FAB** teal góc phải dưới trên `AppShell` — mọi tab; **không** thêm tab thứ 5 |
| Trình bày | **Responsive:** &lt;900px → full-screen `push('/ai')`; ≥900px → **side panel ~400px** bên phải overlay tab hiện tại |
| Transport | **SSE mặc định** (`POST /ai/chat/stream`) + **JSON** (`POST /ai/chat`) fallback / retry |
| Architecture | Hướng **1** — feature `ai/` + FAB trên shell + widget chat dùng chung |
| `AiBloc` lifecycle | Provide ở **`ManageTeamsApp`** (cùng cấp repos / trên router) để cả panel và route `/ai` dùng chung; đóng panel **không** dispose; giữ `sessionId` + tin local đến “Chat mới” / logout |
| Deep-link | Ưu tiên `type` + `id` từ `links[]`; không mở browser làm mặc định |
| Ngoài phạm vi | 6b Confirm ghi, 6c semantic search, 6d admin ops, 6e Google @bot; không gọi `/internal/*` |

---

## 2. Shell, entry & layout

### 2.1 FAB

- Widget FAB trên `AppShell` (`ColorSkin.primary`, icon sparkle/assistant).
- Mobile: `context.push(AppRoutes.ai.path)` (`/ai`).
- Web rộng (≥900px): bật side panel overlay; **không** push full-screen trừ khi user mở trực tiếp `/ai`.

### 2.2 Full-screen (`/ai`)

- AppBar: back · tiêu đề “Trợ lý AI” · action “Chat mới”.
- Badge nhỏ “Mock” khi response gần nhất có `mock == true`.
- Route thuộc app authenticated (cùng redirect JWT như `/home`, `/tasks`, …).

### 2.3 Side panel (web ≥900px)

- Chiều rộng ~400px, full chiều cao body (dưới app bar shell).
- Header: “Trợ lý AI” · Mock badge · “Chat mới” · đóng.
- Nội dung = cùng `AiChatView` như full-screen.
- State mở/đóng: flag local trên `AppShell` (`ValueNotifier<bool>` hoặc `setState`); không thay `navigationShell` index.

---

## 3. UI màn chat (composition dùng chung)

1. **Idle / empty** — chip gợi ý: “Việc nào của tôi đang mở?”, “Tóm tắt khối lượng việc”, “Trạng thái đồng bộ Google?”.
2. **Thread** — bubble user (phải, primary) + assistant (trái, `tealLight`); dưới assistant: link chips theo `links[]` (icon theo `type`: task / group / conversation).
3. **Composer** — ô nhập (max 4000 ký tự) + Gửi; disable khi `sending`; Enter gửi trên web.
4. **Loading** — “Đang tra cứu…”; SSE cập nhật text khi nhận `token`, gắn chips khi `links`, dừng khi `done`.
5. **Không có** nút tạo/sửa task hay Confirm action (Phase 6b).

---

## 4. Data layer & BLoC

### 4.1 Module `features/ai/`

| Đơn vị | Trách nhiệm | Phụ thuộc |
|--------|-------------|-----------|
| `ai_models.dart` | `AiUsage`, `AiLink`, `AiChatResult`, `AiStreamEvent` | — |
| `ai_repository.dart` | `chat()` Dio → `/ai/chat` (receiveTimeout 60s); `chatStream()` SSE qua `http` | `ApiClient` / token |
| `ai_bloc.dart` (+ event/state) | Session, messages, send, new chat, link tap side-effects | `AiRepository` |
| `ai_chat_view.dart` | UI composition | `AiBloc` |
| `ai_page.dart` / panel wrapper | Scaffold full / panel chrome | `AiChatView` |

Đăng ký `AiRepository` trong `app.dart` cạnh repos hiện có. Provide `AiBloc` ở **`ManageTeamsApp`** (trên `MaterialApp.router`) — không gắn riêng trong `AppShell` — để `AiPage` (`/ai` sibling route) và side panel cùng một instance. Khi `AuthUnauthenticated` / logout: `AiNewChatRequested` (hoặc clear tương đương).

### 4.2 Events / state (gợi ý)

**Events:** `AiStarted`, `AiMessageSent(message)`, `AiNewChatRequested`, `AiLinkTapped(AiLink)`, `AiRetryRequested`.

**State sẵn sàng:** `{ sessionId?, messages, sending, mock?, lastError? }` — messages gồm role user/assistant, `answer`, `links`.

### 4.3 Transport

1. Gửi tin → ưu tiên **SSE**.
2. HTTP ≥400 **trước** khi mở stream → parse envelope JSON (`error`/`message`) như các phase khác.
3. Stream đứt giữa chừng → snackbar + “Thử lại”; retry có thể gọi **JSON** `chat()` một lần (không fire song song SSE + JSON).
4. Thứ tự event SSE: `meta` → lưu `sessionId` / mock; `token` → append/set text; `links` → chips; `done` → `sending=false`; `error` → lỗi và dừng.

### 4.4 “Chat mới”

Clear `sessionId` + danh sách tin local; request sau không gửi `sessionId`.

---

## 5. Deep-link entity

Chỉ mở entity có trong `links[]` của response đó. Ưu tiên `id` (+ `type`); parse `href` chỉ fallback lấy `groupId`/`code` nếu cần.

| `type` | Hành động |
|--------|-----------|
| `task` | Đóng panel nếu đang mở → `go('/tasks')` + `TasksFocusRequested(taskId: id)` (filter/scroll/highlight). **Bắt buộc** thêm event này vào `TasksBloc` / UI Tasks nếu chưa có. |
| `group` | Nếu `id` có trong workspace groups → `WorkspaceGroupSelected(id)` rồi `go('/home')`. Nếu không có trong list → snackbar “Không tìm thấy nhóm”. |
| `conversation` | Đóng panel nếu đang mở → `go('/chat')` + mở thread theo `id` (reuse `ChatListBloc` / `ChatThreadBloc`). |

Luôn **đóng side panel** trước khi điều hướng deep-link (để thấy tab đích trên web).

---

## 6. Lỗi → UI

| HTTP / `error` | UI |
|----------------|-----|
| `VALIDATION` | Snackbar message |
| `UNAUTHORIZED` | Refresh token / login (như phase khác) |
| `NOT_FOUND` | Clear session + tin; banner “Đã mở chat mới” |
| `RATE_LIMIT` | Thử lại sau ~1 phút |
| `AI_BUDGET` | Hết hạn mức AI hôm nay |
| `AI_TIMEOUT` / `AI_PROVIDER` / `BAD_GATEWAY` | “AI tạm không trả lời được” + Thử lại |

Map qua `mapDioError` / tương đương cho JSON; SSE pre-stream lỗi dùng cùng envelope.

---

## 7. Test & nghiệm thu

**Test:**

- Unit: `AiChatResult.fromJson`, parse khung SSE (`meta`/`token`/`links`/`done`).
- Unit: map mã lỗi chính.
- (Tuỳ) Widget: empty + một cặp bubble + một link chip.

**Nghiệm thu thủ công:**

1. FAB hiện mọi tab; mobile full-screen; web rộng side panel.
2. Câu “Việc nào của tôi đang mở? Cho link” → `answer` + `links` task thuộc user.
3. Tap link task → Tasks focus đúng `id`.
4. “Chat mới” xoá session; hỏi lại không tái sử dụng session cũ.
5. Mock badge khi `mock == true`.
6. Không gọi `/internal/*`; không phụ thuộc API key LLM phía client.

---

## 8. Ngoài phạm vi (không làm trong 6a)

- Nút / flow Confirm ghi task (6b).
- Semantic search tin/file (6c).
- `GET /ai/admin/ops` (6d).
- Google Chat @bot / digest (6e).
- Thêm bottom tab “AI”.
- Mở `href` web làm đường điều hướng mặc định.

---

## 9. File / route dự kiến

| Path | Ghi chú |
|------|---------|
| `lib/features/ai/data/ai_models.dart` | Models |
| `lib/features/ai/data/ai_repository.dart` | Dio + SSE |
| `lib/features/ai/bloc/ai_*.dart` | BLoC |
| `lib/features/ai/pages/ai_page.dart` | Full-screen |
| `lib/features/ai/widgets/ai_chat_view.dart` | Composition |
| `lib/features/ai/widgets/ai_link_chip.dart` | Chip link |
| `lib/features/shell/pages/app_shell.dart` | FAB + side panel (không provide `AiBloc` tại đây) |
| `lib/app/app.dart` | `AiRepository` + `AiBloc` |
| `lib/app/router/app_router.dart` | `AppRoutes.ai` = `/ai` (sibling authenticated route; redirect như tab app) |
| `lib/features/tasks/bloc/*` | Thêm `TasksFocusRequested` |
| `pubspec.yaml` | Đảm bảo dependency `http` (SSE) nếu chưa có |
| `test/.../ai_*.dart` | Parse / SSE / lỗi |

Tham chiếu API: `frontend/docs/huong-dan-ghep-api-phase-6a.md`.
