# Design: Ghép API Phase 4–5 — Sheets Sync UI (Flutter)

**Ngày:** 2026-09-28  
**Phạm vi:** Frontend Flutter — tích hợp Google Sheets sync (Phase 4) và quan sát sync client-side (Phase 5) theo `huong-dan-ghep-api-phase-4-5.md`.  
**Tiền đề:** Phase 1–3 đã ghép (`2026-09-28-phase1-3-api-ui-design.md`).  
**State management:** **BLoC only** (mở rộng `SyncBloc`, không Cubit, không bloc Sheets riêng).

---

## 1. Quyết định đã chốt

| Chủ đề | Quyết định |
|--------|------------|
| Phạm vi UI | **A** — Mở rộng tab **Sync** hiện có: section “Sheet nhóm” theo `groupId` đang chọn |
| Polling | **B** — **Không poll**; refresh thủ công (kéo xuống / Tải lại) |
| Chưa chọn nhóm | **A** — Ẩn section Sheet, hiện “Chọn nhóm trên header để đồng bộ Sheet” |
| Ensure lần đầu | **B** — Nút rõ ràng “Tạo Sheet nhóm”; không auto-ensure |
| Architecture | Hướng **1** — Mở rộng `SyncRepository` + `SyncBloc` + `SyncTabPage` |
| Phase 5 ops | **Không** gọi `/internal/*`, `/drive/webhook`, health `:3207`, Prometheus |
| Phase 5 user | Reuse `GET /sync/status` (backlog `authRequired` / `failed`, `recentJobs` gồm `SHEETS_*`) |
| Theme | Giữ Vimes (`ColorSkin`, `AppSectionCard`, `AppButton`, BeVietnamPro) |

---

## 2. Hiệu năng (ràng buộc bắt buộc khi implement)

**Đánh giá thiết kế:** ~8.5–9/10 nếu giữ các ràng buộc dưới đây.

| Ràng buộc | Lý do |
|-----------|--------|
| Không timer / không poll sau push-pull | Tránh HTTP nền, pin, spam gateway |
| `GET /sync/sheets/:groupId` chỉ khi đã có `groupId` **và** (đang ở tab Sync **hoặc** user chủ động Refresh trên Sync) | Tránh đổi group ở Home/Tasks mà vẫn gọi sheets API nền |
| `SyncGroupContextChanged`: no-op nếu `groupId` không đổi | Tránh fetch trùng |
| Không render toàn bộ `rowHashes` / `watches[].token` trên UI | Payload lớn, không cần user |
| `busy` / `sheetBusy` disable nút Push/Pull/Ensure khi đang gọi | Chống spam; server cũng có `deduped` + debounce ~45s |
| Sau push/pull: snackbar hướng dẫn kéo refresh — **không** tự gọi lại status theo interval | Khớp lựa chọn B |

**Tải mạng điển hình:** vào/refresh tab Sync có group = tối đa **2 GET** (`/sync/status` + `/sync/sheets/:groupId`). Push/Pull = 1 POST enqueue (+ optional 1 GET nếu user refresh tay).

---

## 3. Data layer

### 3.1 Models (thêm vào `api_models.dart` hoặc file sync models)

Theo doc §10:

- `GroupSheetDto` — gồm helper `isLocalMatrix`, `googleSheetUrl`
- `DriveWatchDto`
- `SheetStatusResponse` — `{ sheet, watches }`
- `SheetsEnqueueResponse` — `{ jobId, deduped, debounceMs? }`

Parse an toàn: `rowHashes` / `writableColumns` default `{}` / `[]`; `sheetTitle` default `"Tasks"`.

### 3.2 `SyncRepository` (mở rộng)

```dart
Future<SheetStatusResponse> getSheetStatus(String groupId);
Future<GroupSheetDto> ensureSheet(String groupId);
Future<SheetsEnqueueResponse> pushSheet(String groupId);
Future<SheetsEnqueueResponse> pullSheet(String groupId);
// Giữ: pull(), fullSync(), status()
```

| Method | HTTP |
|--------|------|
| `getSheetStatus` | `GET /sync/sheets/:groupId` |
| `ensureSheet` | `POST /sync/sheets/:groupId/ensure` |
| `pushSheet` | `POST /sync/sheets/:groupId/push` |
| `pullSheet` | `POST /sync/sheets/:groupId/pull` |

Header: Bearer qua `ApiClient` hiện có. Map lỗi qua `mapDioError`.

### 3.3 Không làm

- Gọi Drive webhook, DLQ replay, ops internal, health google-sync `:3207`
- Đọc env backend `GOOGLE_SHEETS_LIVE` — suy từ `spreadsheetId.startsWith('local-')`

---

## 4. UI — Tab Sync

### 4.1 Cấu trúc trang

1. **Section Google Tasks** (giữ nguyên Phase 2): linked, pull/full, backlog chips, recent jobs, CTA auth.
2. **Section Sheet nhóm** (mới):
   - Không `groupId` → `AppSectionCard` hướng dẫn chọn nhóm trên header.
   - Có `groupId`, `sheet == null` → copy ngắn + nút **Tạo Sheet nhóm**.
   - Có sheet →:
     - Status (`PENDING` / `PUSHED` / `PULLED`)
     - `lastPushAt` / `lastPullAt` (format local)
     - Badge **Local (dev)** nếu `isLocalMatrix`, ngược lại **LIVE**
     - Nút **Đẩy lên Sheet** / **Kéo từ Sheet**
     - Nếu LIVE và có URL → **Mở trên Google Sheets** (`url_launcher`, đã có trong `pubspec`)
     - Tóm tắt watches: “Đang theo dõi Drive” nếu `watches.isNotEmpty` (không hiện token); optional “sắp hết hạn” nếu `expiresAt` gần
3. `authRequired > 0` (từ backlog Tasks status) → cảnh báo đỏ + nhắc login Google lại (scopes Sheets đã có trên login).

### 4.2 Copy snackbar

- Push success: “Đã xếp hàng đẩy Sheet (~{debounceMs/1000}s). Kéo xuống để cập nhật trạng thái.”
- Push `deduped: true`: “Job đẩy Sheet đang chờ — không tạo thêm. Kéo xuống để xem.”
- Pull success: tương tự, không bắt buộc nêu debounce.
- Ensure success: “Đã tạo / cập nhật Sheet nhóm.”
- Lỗi: message từ `ApiException`.

### 4.3 Sau Pull

Không bắt buộc refresh `TasksBloc`. User tự mở tab Tasks hoặc refresh Tasks nếu cần thấy `status` / `personal_note` mới.

---

## 5. `SyncBloc` (mở rộng)

### 5.1 Events mới

| Event | Hành vi |
|-------|---------|
| `SyncGroupContextChanged(String? groupId)` | Nếu id không đổi → return. Clear `sheetStatus` khi null. Khi có id **và** tab Sync active / đang refresh → `getSheetStatus` |
| `SyncSheetEnsureRequested` | `ensureSheet` → cập nhật `sheet` trong state |
| `SyncSheetPushRequested` | `pushSheet` → `SyncActionSuccess` + giữ `sheetStatus` cũ cho đến khi user refresh |
| `SyncSheetPullRequested` | `pullSheet` → tương tự |

Events cũ giữ: `SyncStarted`, `SyncRefreshRequested`, `SyncPullRequested`, `SyncFullRequested`.

### 5.2 State `SyncReady` bổ sung

```dart
selectedGroupId: String?
sheetStatus: SheetStatusResponse?
sheetBusy: bool  // ensure/push/pull sheets
// busy: giữ cho tasks pull/full
```

`SyncStarted` / refresh trên Sync:

1. `status()` luôn
2. Nếu `selectedGroupId != null` → `getSheetStatus` (song song `Future.wait` được phép)

### 5.3 Wiring workspace

- `SyncTabPage` (hoặc wrapper): `BlocListener` / đọc `WorkspaceBloc` → `SyncGroupContextChanged`.
- Chỉ dispatch khi đang build tab Sync (tránh fetch nền khi user ở Home/Tasks).
- `AppRouter` hiện tạo `SyncBloc..add(SyncStarted())` lúc vào shell — **Started chỉ load `/sync/status`**; sheet status load khi tab Sync có group (lần đầu vào tab hoặc refresh).

---

## 6. Auth / scopes

- Login Google đã xin: Tasks + Spreadsheets + Drive.file (`login_page.dart`) — **không đổi**.
- Khi `authRequired > 0`: CTA hướng user login Google lại để lấy `serverAuthCode` mới (flow auth hiện có). Không implement OAuth riêng trên Sync tab trong phase này nếu chưa có helper tái dùng; tối thiểu hiện banner rõ.

---

## 7. Checklist nghiệm thu (khớp doc §12, chỉnh theo quyết định)

- [ ] Models + repository Sheets 4 method JWT
- [ ] UI section Sheet trên Sync; ẩn khi không có group
- [ ] Nút Ensure / Push / Pull
- [ ] Không poll; snackbar + manual refresh
- [ ] Chỉ mở Google URL khi `!isLocalMatrix`
- [ ] CTA khi `backlog.authRequired > 0`
- [ ] Không gọi internal / webhook / health ops
- [ ] Ràng buộc hiệu năng §2 được tuân thủ
- [ ] Unit test parse models (tương tự `api_models_test.dart`)

---

## 8. Ngoài phạm vi

- Màn admin metrics `:3207/health`
- Auto-ensure / auto-push khi sửa task
- Deep link từ Home vào Sheet
- Poll job đến `DONE`
- Sửa cột Sheet từ trong app (chỉ sync qua Google Sheet / pull writable)

---

## 9. Tài liệu liên quan

- `frontend/docs/huong-dan-ghep-api-phase-4-5.md`
- `frontend/docs/superpowers/specs/2026-09-28-phase1-3-api-ui-design.md`
- `backend/docs/runbooks/phase-4-5-deepen.md`
