# Hướng dẫn ghép API Phase 4 → 5 vào Flutter

Tài liệu mô tả **đúng theo backend hiện tại** (api-gateway + google-sync-service), để Flutter ghép **Google Sheets sync (Phase 4)** và **quan sát / hardening client-side (Phase 5)**.

**Tiền đề:** đã ghép Phase 1–3 theo  
[`huong-dan-ghep-api-phase-1-3.md`](./huong-dan-ghep-api-phase-1-3.md)  
và Auth Google theo  
[`huong-dan-ghep-api-auth.md`](./huong-dan-ghep-api-auth.md).

---

## Mục lục

1. [Tổng quan Phase 4–5](#1-tổng-quan-phase-45)
2. [Cấu hình & OAuth scopes mới](#2-cấu-hình--oauth-scopes-mới)
3. [Token, header, lỗi chung](#3-token-header-lỗi-chung)
4. [Phase 4 — Sheets: API Flutter gọi được](#4-phase-4--sheets-api-flutter-gọi-được)
5. [Phase 4 — Ma trận cột & quy tắc ghi](#5-phase-4--ma-trận-cột--quy-tắc-ghi)
6. [Phase 4 — Luồng UI gợi ý](#6-phase-4--luồng-ui-gợi-ý)
7. [Phase 5 — Metrics / health (tuỳ chọn)](#7-phase-5--metrics--health-tuỳ-chọn)
8. [Phase 5 — Việc Flutter không gọi](#8-phase-5--việc-flutter-không-gọi)
9. [Liên hệ với GET /sync/status (Phase 2)](#9-liên-hệ-với-get-syncstatus-phase-2)
10. [Model Dart gợi ý](#10-model-dart-gợi-ý)
11. [Bảng mã lỗi](#11-bảng-mã-lỗi)
12. [Checklist ghép Flutter](#12-checklist-ghép-flutter)

---

## 1. Tổng quan Phase 4–5

### 1.1 Phase ↔ việc Flutter làm

| Phase | Backend làm gì | Flutter cần làm |
|-------|----------------|-----------------|
| **4** | Đồng bộ task nhóm ↔ Google Spreadsheet (push/pull, debounce, Drive watch) | Login Google đủ scope Sheets/Drive; **ensure / push / pull / xem status** theo `groupId` |
| **5** | Metrics, DLQ replay, backup, security check, otel-lite | Chủ yếu **hiển thị trạng thái sync** (`AUTH_REQUIRED`, failed); metrics/health chỉ nếu làm màn admin |

### 1.2 Proxy gateway

| Path | Upstream | Port |
|------|----------|------|
| `/sync/*` | google-sync-service | `3207` |
| `/drive/*` | google-sync-service | `3207` |
| `/metrics` (gateway) | **không** phải metrics Google sync | `3200` |

**Flutter chỉ gọi** `API_*_URL` → gateway `http://localhost:3200` (Android emulator: `http://10.0.2.2:3200`).

### 1.3 Internal vs JWT (rất quan trọng)

| Loại | Path ví dụ | Flutter |
|------|------------|---------|
| **JWT (Bearer)** | `/sync/sheets/:groupId`, `.../ensure`, `.../push`, `.../pull` | **Gọi được** |
| **Public** | `/drive/webhook` | **Không** (Google Drive gọi server) |
| **Internal** | `/internal/sync/sheets`, `/internal/sync/dlq/replay`, `/internal/sync/ops` | **Không** (gateway không proxy `/internal`) |

---

## 2. Cấu hình & OAuth scopes mới

### 2.1 Env Flutter (giữ như Phase 1–3)

```env
APP_ENV=dev
API_DEV_URL=http://localhost:3200
API_PROD_URL=http://localhost:3200
GOOGLE_SERVER_CLIENT_ID=<Web client ID — khớp backend GOOGLE_CLIENT_ID>
```

### 2.2 Scope Google bắt buộc cho Sheets (Phase 4)

Backend identity + Flutter login đã yêu cầu thêm:

| Scope | Mục đích |
|-------|----------|
| `https://www.googleapis.com/auth/tasks` | Phase 2 Tasks (cũ) |
| `https://www.googleapis.com/auth/spreadsheets` | Tạo/đọc/ghi Spreadsheet |
| `https://www.googleapis.com/auth/drive.file` | File do app tạo + Drive watch |

**Giải thích:** User đã login Google trước khi có 2 scope Sheets/Drive sẽ **không** sync LIVE được cho đến khi **đăng nhập Google lại** (lấy `serverAuthCode` mới với đủ scope).

Ví dụ trong `GoogleSignIn` (đã có trong codebase):

```dart
const sheetsScopes = <String>[
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];
// authenticate(scopeHint: sheetsScopes)
// authorizeServer(sheetsScopes) → serverAuthCode
```

Gửi lên backend như Phase 1: `POST /auth/google/id-token` với `{ idToken, serverAuthCode }`.

### 2.3 Chế độ local vs LIVE (backend)

| Env backend | Hành vi | Flutter thấy gì |
|-------------|---------|-----------------|
| `GOOGLE_SHEETS_LIVE` **không** `true` | Push/pull **local matrix** (hash trong DB, `spreadsheetId` dạng `local-sheet-…`) | Status vẫn cập nhật; chưa có link Google Sheet thật |
| `GOOGLE_SHEETS_LIVE=true` | Gọi Sheets/Drive API thật | `spreadsheetId` là id Google; có thể mở `https://docs.google.com/spreadsheets/d/{id}` |

Flutter **không** đọc env backend — suy ra từ `sheet.spreadsheetId`: nếu bắt đầu bằng `local-` → đang local.

---

## 3. Token, header, lỗi chung

### 3.1 Header

```http
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### 3.2 Envelope lỗi (giống Phase 1–3)

```json
{
  "error": "UNAUTHORIZED",
  "message": "…",
  "statusCode": 401
}
```

| HTTP | `error` thường gặp | Ý nghĩa Phase 4–5 |
|------|--------------------|-------------------|
| `401` | `UNAUTHORIZED` | Thiếu/hết hạn JWT |
| `400` | `VALIDATION` / Zod | `groupId` không phải UUID |
| `401` (job) | `AUTH_REQUIRED` (trên job, không phải HTTP ngay) | Google refresh token hỏng — xem `/sync/status` |
| `429` | `RATE_LIMIT` | Gateway rate limit |
| `501` | (hiếm) | Cấu hình LIVE thiếu |

---

## 4. Phase 4 — Sheets: API Flutter gọi được

Base: `POST|GET {API_BASE}/sync/sheets/...`  
Path param `groupId`: **UUID** của nhóm (`groups.id`).

---

### 4.1 Xem trạng thái sheet — `GET /sync/sheets/:groupId`

**Auth:** Bearer  
**Body:** không  
**Success `200`:**

```json
{
  "sheet": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "groupId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "spreadsheetId": "local-sheet-3fa85f64",
    "sheetTitle": "Tasks",
    "driveFileId": "local-drive-3fa85f64",
    "status": "PUSHED",
    "lastPushAt": "2026-09-28T08:00:00.000Z",
    "lastPullAt": null,
    "contentHash": "a1b2c3d4e5f6…",
    "rowHashes": {
      "T-1:user-uuid": "deadbeefcafebabe",
      "T-2:": "0123456789abcdef"
    },
    "writableColumns": ["status", "personal_note"],
    "ownerUserId": "user-uuid",
    "createdAt": "2026-09-28T07:00:00.000Z",
    "updatedAt": "2026-09-28T08:00:00.000Z"
  },
  "watches": [
    {
      "id": "uuid",
      "groupId": "uuid",
      "fileId": "spreadsheet-or-drive-file-id",
      "channelId": "ch-…",
      "resourceId": "… | null",
      "token": "hex-string",
      "expiresAt": "2026-09-29T08:00:00.000Z",
      "status": "ACTIVE",
      "createdAt": "…",
      "updatedAt": "…"
    }
  ]
}
```

**Khi nhóm chưa ensure lần nào:**

```json
{
  "sheet": null,
  "watches": []
}
```

#### Bảng trường `sheet` (object | `null`)

| Trường JSON | Kiểu Dart | Nullable | Mô tả |
|-------------|-----------|----------|--------|
| `id` | `String` (UUID) | không | PK `group_sheets` |
| `groupId` | `String` (UUID) | không | Nhóm sở hữu sheet |
| `spreadsheetId` | `String?` | có | Id Google Spreadsheet **hoặc** `local-sheet-…` |
| `sheetTitle` | `String` | không | Mặc định `"Tasks"` |
| `driveFileId` | `String?` | có | Thường = spreadsheetId khi LIVE |
| `status` | `String` | không | Xem enum dưới |
| `lastPushAt` | `DateTime?` (ISO-8601) | có | Lần push thành công gần nhất |
| `lastPullAt` | `DateTime?` | có | Lần pull gần nhất |
| `contentHash` | `String?` | có | Hash toàn matrix (idempotent push) |
| `rowHashes` | `Map<String, String>` | không (có thể `{}`) | Key = `"{code}:{assigneeUserId}"` |
| `writableColumns` | `List<String>` | không | Cột được phép sửa từ Sheet → app |
| `ownerUserId` | `String?` (UUID) | có | User enqueue / owner OAuth LIVE |
| `createdAt` | `DateTime` | không | |
| `updatedAt` | `DateTime` | không | |

**`sheet.status` (string, không phải enum cứng DB):**

| Giá trị | Ý nghĩa UI |
|---------|------------|
| `PENDING` | Đã tạo bản ghi, chưa push |
| `PUSHED` | Push thành công (local hoặc LIVE) |
| `PULLED` | Pull thành công gần nhất |

#### Bảng trường `watches[]` (Drive channel ACTIVE, tối đa 5)

| Trường | Kiểu | Mô tả |
|--------|------|--------|
| `id` | `String` UUID | |
| `groupId` | `String` UUID | |
| `fileId` | `String` | File/spreadsheet đang watch |
| `channelId` | `String` | Id kênh Drive |
| `resourceId` | `String?` | Có khi LIVE đăng ký thành công |
| `token` | `String` | Token xác minh webhook (Flutter **không** gửi webhook) |
| `expiresAt` | `DateTime` | Hết hạn → cần renew (server) |
| `status` | `String` | Ở list này luôn `"ACTIVE"` |
| `createdAt` / `updatedAt` | `DateTime` | |

**Giải thích:** Flutter chỉ **đọc** watches để hiện “đã bật theo dõi Drive” / sắp hết hạn. Đăng ký watch là API **internal** (ops).

---

### 4.2 Ensure sheet — `POST /sync/sheets/:groupId/ensure`

**Auth:** Bearer  
**Body:** không bắt buộc (`{}` hoặc trống)  
**Success `201`:** trả **object `GroupSheet`** (cùng schema `sheet` ở §4.1, không bọc thêm).

Ví dụ local:

```json
{
  "id": "uuid",
  "groupId": "uuid",
  "spreadsheetId": "local-sheet-3fa85f64",
  "sheetTitle": "Tasks",
  "driveFileId": "local-drive-3fa85f64",
  "status": "PENDING",
  "lastPushAt": null,
  "lastPullAt": null,
  "contentHash": null,
  "rowHashes": {},
  "writableColumns": ["status", "personal_note"],
  "ownerUserId": "uuid-user-hiện-tại",
  "createdAt": "…",
  "updatedAt": "…"
}
```

**Giải thích:** Upsert — lần 1 tạo row; lần sau cập nhật `ownerUserId` = user gọi API. Nên gọi **trước** push/pull hoặc khi mở màn “Sheet nhóm”.

---

### 4.3 Push sheet — `POST /sync/sheets/:groupId/push`

**Auth:** Bearer  
**Body:** không  
**Success `202`:**

```json
{
  "jobId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "deduped": false,
  "debounceMs": 45000
}
```

| Trường | Kiểu | Mô tả |
|--------|------|--------|
| `jobId` | `String` UUID | Id job `SHEETS_PUSH` trong `sync_jobs` |
| `deduped` | `bool` | `true` = đã có job PENDING/RETRY/RUNNING cùng group → **không tạo job mới** |
| `debounceMs` | `int` | Thời gian trì hoãn trước khi worker chạy (mặc định **45000** ms) |

**Giải thích:**

- Nhiều thay đổi task trong vài chục giây chỉ nên tạo **vài** lời gọi ghi sheet → debounce gom lại.
- UI: sau `202`, poll `GET /sync/sheets/:groupId` hoặc `GET /sync/status` khoảng 5–15s; đợi `lastPushAt` / `status=PUSHED`.
- Nếu `deduped: true`, job cũ vẫn sẽ chạy — không cần push lại ngay.

---

### 4.4 Pull sheet — `POST /sync/sheets/:groupId/pull`

**Auth:** Bearer  
**Body:** không  
**Success `202`:**

```json
{
  "jobId": "uuid",
  "deduped": false
}
```

| Trường | Kiểu | Mô tả |
|--------|------|--------|
| `jobId` | `String` UUID | Job `SHEETS_PULL` |
| `deduped` | `bool` | Giống push |

**Giải thích:**

- Pull chỉ áp cột **writable** (`status`, `personal_note`) vào `task_assignees`.
- Đổi `title` trên Sheet **không** vào app (cột protected).
- Local: không có `values` từ Drive → pull no-op theo matrix DB.
- LIVE: đọc spreadsheet thật rồi so `rowHashes`.

---

## 5. Phase 4 — Ma trận cột & quy tắc ghi

### 5.1 Cột trên Spreadsheet (thứ tự A→E)

| Cột | Header | Writable từ Sheet → app? |
|-----|--------|---------------------------|
| A | `code` | **Không** (khóa + protected) |
| B | `title` | **Không** (protected) |
| C | `status` | **Có** |
| D | `personal_note` | **Có** |
| E | `assignee_user_id` | Không sửa ngược (dùng để map dòng) |

Một task nhiều assignee → **nhiều hàng** cùng `code`, khác `assignee_user_id`.

### 5.2 Key trong `rowHashes`

```
"{code}:{assignee_user_id}"
```

Ví dụ: `"T-12:550e8400-e29b-41d4-a716-446655440000"`  
Assignee trống: `"T-12:"`.

### 5.3 Link mở Sheet (LIVE)

```dart
final id = sheet.spreadsheetId;
if (id != null && !id.startsWith('local-')) {
  final url = 'https://docs.google.com/spreadsheets/d/$id';
  // launchUrl(...)
}
```

---

## 6. Phase 4 — Luồng UI gợi ý

```
[Màn chi tiết nhóm]
  1. User đã Google login + serverAuthCode (scopes Sheets)?
     → Không: CTA “Liên kết Google (Sheets)”
  2. GET /sync/sheets/:groupId
     → sheet == null → POST .../ensure → hiện status PENDING
  3. Nút “Đẩy lên Sheet” → POST .../push → snackbar “Đang đồng bộ (~45s)”
  4. Poll GET .../sheets/:groupId mỗi 10s đến khi lastPushAt đổi / status PUSHED
  5. Nút “Kéo từ Sheet” → POST .../pull → refresh danh sách task nhóm
  6. Nếu GET /sync/status → backlog.authRequired > 0
     → bắt login Google lại
```

**Không** cần Flutter gọi Drive webhook hay DLQ.

---

## 7. Phase 5 — Metrics / health (tuỳ chọn)

Phase 5 chủ yếu là **ops server**. Flutter app user thường **không** cần. Nếu làm màn “Trạng thái hệ thống” (admin):

### 7.1 Health google-sync (không qua gateway mặc định)

Gọi thẳng service (dev): `GET http://localhost:3207/health`

**Success `200`:**

```json
{
  "status": "ok",
  "service": "google-sync-service",
  "time": "2026-09-28T08:00:00.000Z",
  "google": {
    "googleCalls": 12,
    "google429": 0,
    "sheetsPush": 3,
    "sheetsPull": 1,
    "tasksPush": 5,
    "tasksPull": 3,
    "startedAt": 1727510000000,
    "upSeconds": 3600,
    "quotaAlert": false
  }
}
```

| Trường `google.*` | Kiểu | Mô tả |
|-------------------|------|--------|
| `googleCalls` | `int` | Tổng lần track gọi Google |
| `google429` | `int` | Đếm lỗi/quota (track fail) |
| `sheetsPush` / `sheetsPull` | `int` | |
| `tasksPush` / `tasksPull` | `int` | |
| `startedAt` | `int` | Epoch ms process start |
| `upSeconds` | `int` | Uptime giây |
| `quotaAlert` | `bool` | `true` nếu tỷ lệ fail ≥ 20% hoặc `google429 ≥ 10` |

> Gateway `GET :3200/metrics` là metrics **gateway**, không phải Google sync. Prometheus text của sync: `GET :3207/metrics` (dev/ops).

### 7.2 Sync status user (nên dùng trên app)

Xem §9 — đây là API Phase 5 **thực sự hữu ích** cho Flutter (backlog FAILED / AUTH_REQUIRED).

---

## 8. Phase 5 — Việc Flutter không gọi

| API | Ai dùng | Lý do |
|-----|---------|--------|
| `POST /internal/sync/dlq/replay` | worker / ops | Internal token |
| `GET /internal/sync/ops` | ops | Internal |
| `POST /internal/sync/drive/watch` | ops / server | Internal |
| `POST /drive/webhook` | Google Drive | Public nhưng không phải app |
| `scripts/backup-postgres.sh` | DevOps | Không phải HTTP app |
| `security-env-check` | CI | Không phải app |

**Giải thích:** Khi job Sheets `FAILED`, user app chỉ cần hiện lỗi + nút “Thử đồng bộ lại” (`push`/`pull`). Ops mới replay DLQ.

---

## 9. Liên hệ với `GET /sync/status` (Phase 2)

Vẫn dùng để theo dõi **toàn bộ** sync jobs của user (Tasks + Sheets).

`GET /sync/status` → `200`:

```json
{
  "googleLinked": true,
  "tasksLastPullAt": "… | null",
  "tasksSyncCursor": "string | null",
  "tasksPollIntervalS": 300,
  "tasksNextPollAt": "… | null",
  "backlog": {
    "pending": 1,
    "retry": 0,
    "failed": 0,
    "authRequired": 0
  },
  "linkedTasks": 12,
  "recentJobs": [
    {
      "id": "uuid",
      "jobType": "SHEETS_PUSH",
      "status": "PENDING",
      "attempts": 0,
      "lastError": null,
      "nextRunAt": "2026-09-28T08:00:45.000Z",
      "updatedAt": "…",
      "aggregateId": "group-uuid"
    }
  ]
}
```

#### `recentJobs[].jobType` liên quan Phase 4

| `jobType` | Ý nghĩa |
|-----------|----------|
| `SHEETS_PUSH` | Đẩy matrix lên sheet |
| `SHEETS_PULL` | Kéo từ sheet |
| `TASKS_PUSH` / `TASKS_PULL` | Phase 2 |

#### `recentJobs[].status`

| Status | UI |
|--------|-----|
| `PENDING` / `RETRY` | Đang chờ (Sheets push có thể còn debounce) |
| `RUNNING` | Worker đang chạy |
| `DONE` | Xong |
| `FAILED` | Hiện `lastError`, cho bấm lại push/pull |
| `AUTH_REQUIRED` | Bắt buộc login Google lại |

Với job Sheets: `aggregateId` = **`groupId`**.

---

## 10. Model Dart gợi ý

```dart
class GroupSheetDto {
  GroupSheetDto({
    required this.id,
    required this.groupId,
    this.spreadsheetId,
    required this.sheetTitle,
    this.driveFileId,
    required this.status,
    this.lastPushAt,
    this.lastPullAt,
    this.contentHash,
    required this.rowHashes,
    required this.writableColumns,
    this.ownerUserId,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String groupId;
  final String? spreadsheetId;
  final String sheetTitle;
  final String? driveFileId;
  final String status; // PENDING | PUSHED | PULLED
  final DateTime? lastPushAt;
  final DateTime? lastPullAt;
  final String? contentHash;
  final Map<String, String> rowHashes;
  final List<String> writableColumns;
  final String? ownerUserId;
  final DateTime createdAt;
  final DateTime updatedAt;

  bool get isLocalMatrix =>
      spreadsheetId == null || spreadsheetId!.startsWith('local-');

  String? get googleSheetUrl => isLocalMatrix || spreadsheetId == null
      ? null
      : 'https://docs.google.com/spreadsheets/d/$spreadsheetId';

  factory GroupSheetDto.fromJson(Map<String, dynamic> j) => GroupSheetDto(
        id: j['id'] as String,
        groupId: j['groupId'] as String,
        spreadsheetId: j['spreadsheetId'] as String?,
        sheetTitle: j['sheetTitle'] as String? ?? 'Tasks',
        driveFileId: j['driveFileId'] as String?,
        status: j['status'] as String,
        lastPushAt: j['lastPushAt'] != null
            ? DateTime.parse(j['lastPushAt'] as String)
            : null,
        lastPullAt: j['lastPullAt'] != null
            ? DateTime.parse(j['lastPullAt'] as String)
            : null,
        contentHash: j['contentHash'] as String?,
        rowHashes: Map<String, String>.from(
          (j['rowHashes'] as Map?)?.map(
                (k, v) => MapEntry(k.toString(), v.toString()),
              ) ??
              {},
        ),
        writableColumns: (j['writableColumns'] as List? ?? const [])
            .map((e) => e.toString())
            .toList(),
        ownerUserId: j['ownerUserId'] as String?,
        createdAt: DateTime.parse(j['createdAt'] as String),
        updatedAt: DateTime.parse(j['updatedAt'] as String),
      );
}

class DriveWatchDto {
  DriveWatchDto({
    required this.id,
    required this.groupId,
    required this.fileId,
    required this.channelId,
    this.resourceId,
    required this.token,
    required this.expiresAt,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String groupId;
  final String fileId;
  final String channelId;
  final String? resourceId;
  final String token;
  final DateTime expiresAt;
  final String status;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory DriveWatchDto.fromJson(Map<String, dynamic> j) => DriveWatchDto(
        id: j['id'] as String,
        groupId: j['groupId'] as String,
        fileId: j['fileId'] as String,
        channelId: j['channelId'] as String,
        resourceId: j['resourceId'] as String?,
        token: j['token'] as String,
        expiresAt: DateTime.parse(j['expiresAt'] as String),
        status: j['status'] as String,
        createdAt: DateTime.parse(j['createdAt'] as String),
        updatedAt: DateTime.parse(j['updatedAt'] as String),
      );
}

class SheetStatusResponse {
  SheetStatusResponse({this.sheet, required this.watches});

  final GroupSheetDto? sheet;
  final List<DriveWatchDto> watches;

  factory SheetStatusResponse.fromJson(Map<String, dynamic> j) =>
      SheetStatusResponse(
        sheet: j['sheet'] == null
            ? null
            : GroupSheetDto.fromJson(j['sheet'] as Map<String, dynamic>),
        watches: (j['watches'] as List? ?? const [])
            .map((e) => DriveWatchDto.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class SheetsEnqueueResponse {
  SheetsEnqueueResponse({
    required this.jobId,
    required this.deduped,
    this.debounceMs,
  });

  final String jobId;
  final bool deduped;
  final int? debounceMs; // chỉ có trên push

  factory SheetsEnqueueResponse.fromJson(Map<String, dynamic> j) =>
      SheetsEnqueueResponse(
        jobId: j['jobId'] as String,
        deduped: j['deduped'] as bool? ?? false,
        debounceMs: j['debounceMs'] as int?,
      );
}
```

### Repository gợi ý

```dart
abstract class SheetsSyncRepository {
  Future<SheetStatusResponse> getStatus(String groupId);
  Future<GroupSheetDto> ensure(String groupId);
  Future<SheetsEnqueueResponse> push(String groupId);
  Future<SheetsEnqueueResponse> pull(String groupId);
}

// Dio:
// GET  /sync/sheets/$groupId
// POST /sync/sheets/$groupId/ensure
// POST /sync/sheets/$groupId/push
// POST /sync/sheets/$groupId/pull
```

---

## 11. Bảng mã lỗi

| Tình huống | HTTP | `error` / tín hiệu | Việc Flutter làm |
|------------|------|--------------------|------------------|
| Chưa login | `401` | `UNAUTHORIZED` | Refresh token / login |
| `groupId` sai format | `400` | validation | Fix path |
| Chưa liên kết Google / mất refresh | job `AUTH_REQUIRED` | `/sync/status` | Login Google lại + đủ scope Sheets |
| Push trùng / đang chờ | `202` `deduped: true` | — | Poll status, không spam |
| Job fail | `recentJobs[].status=FAILED` | `lastError` | Hiện message + nút thử lại |
| Local mode | `spreadsheetId` = `local-…` | — | Ẩn “Mở trên Google Sheets” hoặc ghi chú “dev local” |

---

## 12. Checklist ghép Flutter

- [ ] Google Sign-In xin đủ 3 scope: Tasks + Spreadsheets + Drive.file  
- [ ] Luôn gửi `serverAuthCode` khi login/link Google  
- [ ] User cũ: buộc re-consent Google một lần  
- [ ] Màn nhóm: `GET /sync/sheets/:groupId`  
- [ ] Nút Ensure / Push / Pull gọi đúng 3 POST JWT  
- [ ] Parse `GroupSheetDto` + `debounceMs` trên push  
- [ ] Poll status sau push (~10s × vài lần)  
- [ ] CTA khi `backlog.authRequired > 0`  
- [ ] Chỉ mở URL Google khi `!spreadsheetId.startsWith('local-')`  
- [ ] **Không** gọi `/internal/*`, `/drive/webhook`, DLQ từ app  

---

## Phụ lục — curl nhanh (dev)

```bash
TOKEN=...   # access JWT
GID=...     # group UUID
BASE=http://localhost:3200

curl -s "$BASE/sync/sheets/$GID" -H "Authorization: Bearer $TOKEN" | jq

curl -s -X POST "$BASE/sync/sheets/$GID/ensure" \
  -H "Authorization: Bearer $TOKEN" | jq

curl -s -X POST "$BASE/sync/sheets/$GID/push" \
  -H "Authorization: Bearer $TOKEN" | jq

curl -s -X POST "$BASE/sync/sheets/$GID/pull" \
  -H "Authorization: Bearer $TOKEN" | jq

curl -s "$BASE/sync/status" -H "Authorization: Bearer $TOKEN" | jq
```

Runbook backend: [`backend/docs/runbooks/phase-4-5-deepen.md`](../../backend/docs/runbooks/phase-4-5-deepen.md).
