# Design: Ghép API Phase 1–3 + UI App Shell (Flutter)

**Ngày:** 2026-09-28  
**Phạm vi:** Frontend Flutter — tích hợp API theo `huong-dan-ghep-api-phase-1-3.md` và dựng giao diện thống nhất theme Vimes.  
**State management:** **BLoC only** (không dùng Cubit), đồng bộ pattern với `AuthBloc` hiện có.

---

## 1. Quyết định đã chốt

| Chủ đề | Quyết định |
|--------|------------|
| Phạm vi | Full Phase 1 → 3 (Org, Group, Task, Chat REST/Socket, file, reaction, search, push token, Google Tasks sync) |
| Shell | Mobile: bottom tabs · Web (≥900px): top nav (A1) |
| Context | Bộ chọn Org + Group cố định trên header mọi tab |
| Chat | 2 khu: chat GROUP + chat theo TASK (trong group đang chọn) |
| Tasks UI | Board Kanban kéo thả + List + Lịch (Ngày/Tuần/Tháng) |
| Lịch | Tạm map theo `createdAt` (backend chưa có `dueDate`) |
| Triển khai | Hướng 1: Shell trước, nối API theo tab |
| State | **BLoC** (events/states), không Cubit |

---

## 2. App Shell & điều hướng

### 2.1 Cấu trúc

- Widget `AppShell`: `Scaffold` + vùng nội dung tab + navigation.
- Breakpoint `≥ 900px`: `NavigationBar` / tab trên top app bar.
- `< 900px`: `NavigationBar` dưới (Home / Tasks / Chat / Sync).
- Header chung:
  - Logo/brand Vimes
  - **Org picker** + **Group picker**
  - Avatar / menu (logout qua `AuthBloc`)

### 2.2 Routes (trong shell sau login)

| Path | Tab |
|------|-----|
| `/home` | Home — Org/Group/members |
| `/tasks` | Tasks — Board/List/Lịch |
| `/chat` | Chat — list + thread |
| `/chat/:conversationId` | Thread (mobile stack / web detail) |
| `/sync` | Google Tasks sync status |

Auth routes giữ nguyên (`/login`, `/register`, …). Redirect authenticated → shell (mặc định `/home`).

### 2.3 Theme

- Giữ `ColorSkin` (primary `#0E7C86`, secondary `#F5A028`), font `BeVietnamPro`.
- Dùng lại shared widgets: `AppButton`, `AppTextField`, `AppSectionCard`, snackbar, bottom sheet.
- Không invent palette mới.

---

## 3. Workspace context (BLoC)

### 3.1 `WorkspaceBloc`

Quản lý org/group đang chọn; cung cấp cho mọi tab.

**Events (ví dụ):**

- `WorkspaceStarted` — load orgs, restore selection từ local storage
- `WorkspaceOrgSelected(orgId)`
- `WorkspaceGroupSelected(groupId)`
- `WorkspaceRefreshRequested`
- `WorkspaceOrgCreated` / `WorkspaceGroupCreated` (sau create → refresh + select)

**States:**

- `WorkspaceInitial` / `WorkspaceLoading`
- `WorkspaceReady({ orgs, groups, selectedOrgId, selectedGroupId, … })`
- `WorkspaceFailure(message)`

**Persist:** lưu `selectedOrgId` / `selectedGroupId` (secure storage hoặc shared prefs) để mở lại app giữ context.

**Quyền UI:** đọc `role` / `myRole` từ list org/group để ẩn/hiện CTA admin.

---

## 4. Tab Home — Org & Group

### 4.1 UI

- Card tổ chức đang chọn + actions: tạo org, chấp nhận lời mời (token).
- Card nhóm đang chọn: tên, `myRole`, số thành viên.
- CTA (OWNER/ADMIN): Mời thành viên, Tạo nhóm.
- Danh sách thành viên nhóm: thêm / xóa (đủ quyền).
- Empty: chưa có org → “Tạo tổ chức đầu tiên”.

### 4.2 API

- `GET/POST /organizations`
- `POST /organizations/:orgId/invitations`
- `POST /invitations/org/accept`
- `GET/POST /organizations/:orgId/groups`
- `GET /groups/:groupId`
- `POST/DELETE /groups/:groupId/members[/:userId]`

### 4.3 `HomeBloc`

Events: load detail, invite, accept invite, create group, add/remove member.  
Phối hợp `WorkspaceBloc` khi tạo org/group mới.

---

## 5. Tab Tasks — Board / List / Lịch

### 5.1 View switcher

Ba chế độ trong cùng tab:

1. **Board (Kanban)** — cột `TODO` | `IN_PROGRESS` | `DONE`, kéo thả card.
2. **List** — danh sách + filter status.
3. **Lịch** — tab phụ **Ngày / Tuần / Tháng**; đặt task theo **`createdAt`**.

### 5.2 Kéo thả ↔ API

| Hành động UI | API |
|--------------|-----|
| TODO → IN_PROGRESS | `POST …/tasks/:code/claim` (nếu `allowClaim`) |
| IN_PROGRESS → DONE | `POST …/tasks/:code/complete` (phải là assignee) |
| Kéo ngược / đổi status tự do | **Không hỗ trợ** — revert UI + snackbar giải thích |

Optimistic UI: cập nhật cột ngay; nếu API lỗi → rollback card + message.

### 5.3 Tạo / chi tiết

- Tạo: bottom sheet / dialog (title bắt buộc, description, completionMode, allowClaim, assigneeIds…).
- Chi tiết theo **`code`** (không dùng UUID trên path): claim / assign / complete.
- Hiển thị `code` (vd `ENG-42`) trên mọi card.

### 5.4 API

- `GET/POST /groups/:groupId/tasks`
- `GET /groups/:groupId/tasks/:code`
- `POST …/claim` | `assign` | `complete`

### 5.5 `TasksBloc`

Events: `TasksStarted`, `TasksViewChanged(board|list|calendar)`, `TasksCalendarRangeChanged`, `TaskCreated`, `TaskDragged(code, from, to)`, `TaskClaimed`, `TaskCompleted`, `TasksRefreshed`.

State chứa đủ list tasks + view mode + calendar range để UI rebuild.

**Package gợi ý:** `flutter_bloc` (đã có) + drag-and-drop (`DragTarget`/`LongPressDraggable` hoặc package board có sẵn nếu team đồng ý). Lịch: custom grid hoặc package calendar nhẹ; data key = ngày `createdAt` local.

---

## 6. Tab Chat

### 6.1 UI

- Cột/list trái (hoặc full màn mobile):
  - Section **Nhóm**: conversation `type=GROUP` của `groupId` đang chọn.
  - Section **Theo task**: conversations `type=TASK` thuộc group (khớp `taskId` / title).
- Web: master–detail trong tab.
- Mobile: list → push thread.
- Composer: text + đính kèm file; reaction trên bubble; search trong thread (`q.length ≥ 2`).
- Unread: so `lastReadSeq` với max `seq` đã biết.

### 6.2 Realtime & file

- Socket chat-service `:3204`, auth token; `join`/`leave` theo conversation.
- Gửi: `clientMsgId` ổn định khi retry; optimistic + reconcile.
- File: `init` → PUT `putUrl` → `complete` → `fileIds` trên message.
- Phase 3: tin `origin=GOOGLE_CHAT` (nếu có) hiển thị như tin thường — **không filter bỏ**.

### 6.3 `ChatListBloc` + `ChatThreadBloc`

- `ChatListBloc`: conversations filtered by workspace group (2 section GROUP / TASK).
- `ChatThreadBloc`: messages, send, edit/delete (nếu làm trong phase), reactions, markRead, search.
- Lắng nghe stream từ `ChatSocketService` → events kiểu `ChatSocketMessageReceived`.

---

## 7. Tab Sync

### 7.1 UI

- Trạng thái `googleLinked`, `linkedTasks`, `tasksLastPullAt`.
- Nút Pull (`POST /sync/tasks/pull`) và Full (`POST /sync/tasks/full`).
- Backlog chips: pending / retry / failed / authRequired.
- Danh sách `recentJobs`.
- `googleLinked == false` → CTA liên kết Google (flow auth Google hiện có).
- `authRequired > 0` → cảnh báo login Google lại.

### 7.2 `SyncBloc`

Events: load status, trigger pull/full, poll/refresh sau job.

---

## 8. Data layer

### 8.1 Repositories

| Repo | Trách nhiệm |
|------|-------------|
| `CoreRepository` (mở rộng) | Org, invitation, group, members, tasks |
| `ChatRepository` (mở rộng) | Conversations, messages, read, reactions, search |
| `FileRepository` (mới) | init / complete / download list |
| `SyncRepository` (mới) | pull, full, status |
| `DeviceRepository` (mới, nhỏ) | push-token register/list/delete |
| `AuthRepository` | Giữ nguyên |

### 8.2 Models

Typed models theo docs §15 (`OrganizationItem`, `GroupSummary`, `TaskListItem`, `ConversationItem`, `ChatMessage`, `SyncStatus`, …). Parse an toàn; snake_case chỉ chỗ `/auth/me` đã xử lý ở auth.

### 8.3 Networking

- REST qua gateway `:3200` (`ApiClient` + Bearer interceptor).
- Socket riêng `:3204`.
- `mapDioError` → `ApiException(code, message)`; UI map mã → tiếng Việt.

### 8.4 Push

Đăng ký `POST /devices/push-token` theo platform sau login (FCM worker có thể vẫn stub).

---

## 9. Thứ tự triển khai (hướng 1)

1. **Shell + WorkspaceBloc** + routing 4 tab (empty/skeleton).
2. **HomeBloc** + API org/group/invite/members + UI Home.
3. **TasksBloc** + list/create/claim/complete → **Board DnD** → List → Lịch (`createdAt`).
4. **ChatBloc** + REST list/send/read → Socket → file → reaction/search.
5. **SyncBloc** + status/pull/full + CTA Google.
6. Push token + polish empty/error/loading đồng bộ theme.
7. Kiểm thử tay theo checklist docs §17.

Mỗi bước: UI dùng `ColorSkin` + shared widgets; không để lại Home debug dạng `ChoiceChip` hiện tại.

---

## 10. Ràng buộc & ngoài phạm vi

- **Không** gọi `/internal/*` hay Google Chat webhook từ Flutter.
- **Không** đổi status task tùy ý ngoài claim/complete.
- **Không** có `dueDate` — lịch dùng `createdAt` cho đến khi backend bổ sung.
- Refresh JWT API chưa có — logout local; socket reconnect với token mới khi login lại.
- Không dùng Cubit; mọi feature state qua **Bloc + Event + State**.

---

## 11. Kiểm thử chấp nhận (tóm tắt)

1. Register → OTP → Login → vào shell, chọn org/group trên header.
2. Tạo org → group → member → task → thấy conversation.
3. Kéo task TODO→IN_PROGRESS (claim) và →DONE (complete); kéo ngược bị chặn có message.
4. Lịch: task xuất hiện đúng ngày theo `createdAt`; đổi tab Ngày/Tuần/Tháng.
5. Hai client: socket nhận `message:new`; upload file nhỏ → gửi kèm.
6. Sync: status + pull; UI phản ánh `googleLinked` / `authRequired`.

---

*Spec phản ánh brainstorm 2026-09-28. Nguồn API: `frontend/docs/huong-dan-ghep-api-phase-1-3.md`.*
