# Hướng dẫn ghép API Phase 1 → 3 vào Flutter

Tài liệu mô tả **đúng theo backend hiện tại** (api-gateway + identity / core / chat / google-sync), để ghép Flutter từ Phase 1 đến Phase 3.

**Auth chi tiết (register / login / OTP / Google / reset):** xem thêm  
[`huong-dan-ghep-api-auth.md`](./huong-dan-ghep-api-auth.md) — phần dưới đây tóm tắt đủ để ghép end-to-end.

---

## Mục lục

1. [Tổng quan Phase & kiến trúc](#1-tổng-quan-phase--kiến-trúc)
2. [Cấu hình Flutter](#2-cấu-hình-flutter)
3. [Token, header, lỗi chung](#3-token-header-lỗi-chung)
4. [Phase 1 — Auth](#4-phase-1--auth)
5. [Phase 1 — Tổ chức (Organization)](#5-phase-1--tổ-chức-organization)
6. [Phase 1 — Nhóm (Group)](#6-phase-1--nhóm-group)
7. [Phase 1 — Task](#7-phase-1--task)
8. [Phase 1.5 — Chat REST](#8-phase-15--chat-rest)
9. [Phase 1.5 — Socket.IO realtime](#9-phase-15--socketio-realtime)
10. [Phase 1.6 — File đính kèm](#10-phase-16--file-đính-kèm)
11. [Phase 1.7 — Reaction, search, push token](#11-phase-17--reaction-search-push-token)
12. [Phase 2 / 2.5 — Google Tasks sync](#12-phase-2--25--google-tasks-sync)
13. [Phase 3 — Google Chat (Flutter cần biết gì)](#13-phase-3--google-chat-flutter-cần-biết-gì)
14. [Luồng nghiệp vụ end-to-end](#14-luồng-nghiệp-vụ-end-to-end)
15. [Model Dart gợi ý](#15-model-dart-gợi-ý)
16. [Bảng mã lỗi tổng hợp](#16-bảng-mã-lỗi-tổng-hợp)
17. [Checklist ghép Flutter](#17-checklist-ghép-flutter)

---

## 1. Tổng quan Phase & kiến trúc

### 1.1 Phase ↔ tính năng Flutter

| Phase | Nội dung | Client gọi qua |
|-------|----------|----------------|
| **1** | Auth email/OTP/Google, org, group, task | Gateway `:3200` |
| **1.5** | Chat text REST + Socket.IO | REST → gateway; **Socket → chat-service `:3204`** |
| **1.6** | Upload / download file chat | Gateway `/files`, `/conversations/:id/files` |
| **1.7** | Reaction, search tin, đăng ký push token | Gateway |
| **2 / 2.5** | Kéo/đẩy Google Tasks, trạng thái sync | Gateway `/sync/*` |
| **3** | Google Chat bot / webhook | Chủ yếu **server-side**; Flutter hầu như không gọi |

### 1.2 Service & proxy gateway

| Path prefix | Upstream | Port mặc định |
|-------------|----------|---------------|
| `/auth/*` | identity-service | `3202` |
| `/organizations`, `/invitations`, `/groups` | core-service | `3203` |
| `/conversations`, `/files`, `/devices` | chat-service | `3204` |
| `/sync`, `/google-chat`, `/drive` | google-sync-service | `3207` |
| `/ai` | ai-service | `3205` (ngoài phạm vi Phase 1–3 client) |

**Flutter chỉ gọi `API_*_URL` → api-gateway (`http://localhost:3200`)**, trừ Socket.IO (xem §9).

### 1.3 Endpoint nội bộ (`/internal/*`)

Core ↔ chat ↔ google-sync dùng `x-internal-token`. **Flutter không gọi** các path này (gateway cũng không proxy `/internal`).

---

## 2. Cấu hình Flutter

### 2.1 `.env`

```env
APP_ENV=dev
API_DEV_URL=http://localhost:3200
API_PROD_URL=http://localhost:3200
# Socket.IO — chat-service trực tiếp (không qua gateway)
CHAT_SOCKET_DEV_URL=http://localhost:3204
CHAT_SOCKET_PROD_URL=http://localhost:3204
```

| Môi trường | REST base | Socket base |
|------------|-----------|-------------|
| iOS Simulator | `http://localhost:3200` | `http://localhost:3204` |
| Android emulator | `http://10.0.2.2:3200` | `http://10.0.2.2:3204` |
| Máy thật | `http://<IP-LAN>:3200` | `http://<IP-LAN>:3204` |

### 2.2 Header bắt buộc

```http
Content-Type: application/json
Authorization: Bearer <accessToken>   # mọi API protected
```

### 2.3 Rate limit (gateway)

| Scope | Mặc định | Lỗi |
|-------|----------|-----|
| `/auth/*` | ~30 req/phút | `429` `{ "error": "RATE_LIMIT", ... }` |
| API chung | ~120 req/phút | tương tự |
| Gửi tin chat | `CHAT_RATE_LIMIT_PER_MIN` (mặc định 60) trên chat-service | `RATE_LIMIT` |

---

## 3. Token, header, lỗi chung

### 3.1 Access / refresh token

| | Access JWT | Refresh |
|---|------------|---------|
| Header | `Authorization: Bearer …` | (chưa có `/auth/refresh`) |
| TTL | `expiresIn` = **900** giây | ~30 ngày (opaque, lưu hash DB) |
| Claims | `sub`=userId, `email`, `tv`=tokenVersion | — |

Sau reset password: `tokenVersion` tăng → JWT cũ bị coi revoke khi gọi `/auth/me`.

**Logout:** không có API — chỉ `TokenStore.clear()` local.

### 3.2 Public vs Bearer

| Public (không Bearer) | Cần Bearer |
|-----------------------|------------|
| `/auth/register`, `/login`, `/verify-email`, `/resend-otp` | `/auth/me`, `/auth/google/link` |
| `/auth/forgot-password`, `/reset-password` | Toàn bộ `/organizations`, `/groups`, `/conversations`, `/files`, `/devices`, `/sync` |
| `/auth/google/*` (authorize-url, callback, id-token) | |
| `/health`, `/metrics`, `/ai/ping` | |
| `/google-chat/webhook`, `/drive/webhook` (server Google) | |

### 3.3 Định dạng lỗi chung

```json
{
  "error": "MÃ_LỖI",
  "message": "Thông báo tiếng Việt (tuỳ endpoint)",
  "details": { }
}
```

| Field | Kiểu | Khi nào có |
|-------|------|------------|
| `error` | `string` | Luôn có khi lỗi nghiệp vụ |
| `message` | `string?` | AppError / message tay |
| `details` | `any?` | Chủ yếu Zod → `VALIDATION` (có `issues`) |

Zod fail → HTTP `400`, `error: "VALIDATION"`, `details` = object Zod (có `issues`).

Gateway JWT sai/thiếu → `401` `{ "error": "UNAUTHORIZED" }`.  
Upstream chết → `502` `{ "error": "BAD_GATEWAY", "message": "Upstream không phản hồi" }`.

### 3.4 Cách kiểm dữ liệu phía Flutter (chung)

1. **Trước khi gọi API:** validate form theo cùng rule Zod bên dưới (độ dài, email, UUID…).
2. **Sau response 2xx:** parse JSON an toàn (`as String?`, null-check); thiếu field bắt buộc → coi lỗi parse, không crash UI.
3. **4xx/5xx:** đọc `error` để nhánh UI; hiện `message` nếu có, không thì map mã → text tiếng Việt.
4. **UUID:** mọi `*Id` path/body là UUID v4 string.
5. **Ngày giờ:** ISO-8601 string từ JSON → `DateTime.parse` (UTC).

---

## 4. Phase 1 — Auth

> Chi tiết request/response từng endpoint: [`huong-dan-ghep-api-auth.md`](./huong-dan-ghep-api-auth.md).

### 4.1 Bảng endpoint nhanh

| Method | Path | Auth | Body validation | Success |
|--------|------|------|-----------------|---------|
| `POST` | `/auth/register` | Public | `email` email; `password` min 8; `displayName?` min 1 | `201` `{ userId, email, message }` |
| `POST` | `/auth/verify-email` | Public | `email`; `code` min 4 | `200` `{ ok, message }` |
| `POST` | `/auth/resend-otp` | Public | `email` | `200` `{ message }` (luôn chung) |
| `POST` | `/auth/login` | Public | `email`; `password` min 1 | `200` `{ user:{id,email}, accessToken, refreshToken, expiresIn }` |
| `POST` | `/auth/forgot-password` | Public | `email` | `200` `{ message }` (luôn chung) |
| `POST` | `/auth/reset-password` | Public | `email`; `code` min 4; `newPassword` min 8 | `200` `{ ok, message }` |
| `GET` | `/auth/me` | Bearer | — | `200` `{ user, googleAccounts }` |
| `POST` | `/auth/google/id-token` | Public | `idToken` min 20; `serverAuthCode?` min 10 | `200` như login (+ Tasks token nếu có code) |
| `POST` | `/auth/google/authorize-url` | Public | `redirectUri`; `codeChallenge` 43–128; `state?` 8–128 | `200` `{ authorizationUrl, state }` |
| `POST` | `/auth/google/callback` | Public | `code`; `codeVerifier` 43–128; `redirectUri` | `200` như login |
| `POST` | `/auth/google/link` | Bearer | như callback | `200` `{ ok, google:{…} }` |

### 4.2 Response `/auth/me` — các trường

```json
{
  "user": {
    "id": "uuid",
    "email": "a@b.com",
    "display_name": "Tên hoặc null",
    "email_verified_at": "2026-09-28T…Z hoặc null",
    "token_version": 1
  },
  "googleAccounts": [
    {
      "google_sub": "…",
      "account_type": "personal|workspace",
      "is_primary": true,
      "linked_at": "2026-09-28T…Z"
    }
  ]
}
```

**Lưu ý snake_case** trên `/auth/me` (`display_name`, …) — khác camelCase của login.

### 4.3 Lỗi Auth hay gặp

| HTTP | `error` | UI gợi ý |
|------|---------|----------|
| 401 | `INVALID_CREDENTIALS` | Sai email/mật khẩu |
| 403 | `EMAIL_NOT_VERIFIED` | Đẩy sang OTP |
| 409 | `EMAIL_TAKEN` | Đổi email |
| 400 | `INVALID_OTP` | Sai/hết hạn OTP |
| 429 | `OTP_LOCKED` / `RATE_LIMIT` | Chờ rồi thử lại |
| 401 | `TOKEN_REVOKED` / `UNAUTHORIZED` | Clear token → login |

### 4.4 Kiểm dữ liệu Auth (Flutter)

| Field | Kiểm trước gọi |
|-------|----------------|
| email | Không rỗng, chứa email hợp lệ |
| password (register/reset) | `length >= 8` |
| password (login) | Không rỗng |
| OTP code | 4–6 ký tự số (UI 6 số) |
| idToken | Độ dài ≥ 20 sau Google Sign-In |

Sau login: bắt buộc có `accessToken`, `refreshToken`, `expiresIn`, `user.id` — thiếu → coi response lỗi.

---

## 5. Phase 1 — Tổ chức (Organization)

Base: `{BASE}/organizations…`, `{BASE}/invitations…`  
**Tất cả cần Bearer.**

### 5.1 Tạo org — `POST /organizations`

**Validation body (Zod):**

| Field | Rule |
|-------|------|
| `name` | `string`, min 1, max 120 |

**Success `201`:**

```json
{
  "organization": {
    "id": "uuid",
    "name": "Acme"
  }
}
```

User gọi API trở thành **OWNER** của org.

**Lỗi:** `400 VALIDATION`, `401 UNAUTHORIZED`.

---

### 5.2 Liệt kê org của tôi — `GET /organizations`

**Success `200`:**

```json
{
  "organizations": [
    {
      "id": "uuid",
      "name": "Acme",
      "role": "OWNER"
    }
  ]
}
```

| Field | Kiểu | Ý nghĩa |
|-------|------|---------|
| `id` | UUID | Org id |
| `name` | string | Tên |
| `role` | string | `OWNER` \| `ADMIN` \| `MEMBER` (role **của user hiện tại** trong org) |

Sắp xếp: org mới hơn trước.

---

### 5.3 Mời thành viên — `POST /organizations/:orgId/invitations`

**Path:** `orgId` = UUID.

**Body:**

| Field | Rule | Mặc định |
|-------|------|----------|
| `email` | email hợp lệ | — |
| `role` | `"ADMIN"` \| `"MEMBER"` | `"MEMBER"` |

**Success `201`:**

```json
{
  "ok": true,
  "expiresAt": "2026-10-01T12:00:00.000Z",
  "message": "Đã gửi lời mời tổ chức trên Vimes."
}
```

| Field | Kiểu |
|-------|------|
| `ok` | `bool` |
| `expiresAt` | ISO string (mặc định hết hạn sau `ORG_INVITE_EXPIRY_HOURS`, thường 72h) |
| `message` | string |

**Quyền:** chỉ org **ADMIN/OWNER**.  
**Lỗi:** `403 FORBIDDEN`, `404 NOT_FOUND`, `503 EMAIL_SEND_FAILED`, `400 VALIDATION`.

Email chứa link dạng `{APP_PUBLIC_URL}/invites/org?token=…` — Flutter deep-link nên đọc query `token`.

---

### 5.4 Chấp nhận lời mời — `POST /invitations/org/accept`

**Body:**

| Field | Rule |
|-------|------|
| `token` | string min 10 (token từ email / deep-link) |

**Success `200`:**

```json
{
  "ok": true,
  "organizationId": "uuid"
}
```

**Lỗi:**

| HTTP | `error` | Ý nghĩa |
|------|---------|----------|
| 410 | `INVITE_INVALID` | Token sai hoặc đã dùng |
| 410 | `INVITE_EXPIRED` | Hết hạn |
| 403 | `INVITE_EMAIL_MISMATCH` | Email JWT ≠ email lời mời |

**Kiểm Flutter:** user phải đăng nhập đúng email được mời; giữ `token` nguyên (URL-decode nếu lấy từ query).

---

## 6. Phase 1 — Nhóm (Group)

### 6.1 Tạo nhóm — `POST /organizations/:orgId/groups`

**Quyền:** org ADMIN/OWNER.

**Body:** `{ "name": string min1 max120 }`

**Success `201`:**

```json
{
  "group": {
    "id": "uuid",
    "organizationId": "uuid",
    "name": "Engineering"
  }
}
```

Side-effect: tạo conversation GROUP phía chat (internal). Creator = group **OWNER**.

---

### 6.2 List nhóm — `GET /organizations/:orgId/groups`

**Quyền:** org member.

**Success `200`:**

```json
{
  "groups": [
    {
      "id": "uuid",
      "organizationId": "uuid",
      "name": "Engineering",
      "myRole": "OWNER"
    }
  ]
}
```

| Field | Ý nghĩa |
|-------|---------|
| `myRole` | Role ACTIVE của user trong group, hoặc `null` nếu chưa là member |

---

### 6.3 Chi tiết nhóm — `GET /groups/:groupId`

**Quyền:** group member ACTIVE.

**Success `200`:**

```json
{
  "group": {
    "id": "uuid",
    "organizationId": "uuid",
    "name": "Engineering",
    "settings": {},
    "members": [
      {
        "userId": "uuid",
        "role": "OWNER",
        "email": "a@b.com",
        "displayName": "A"
      }
    ]
  }
}
```

| Field | Kiểu | Ghi chú |
|-------|------|---------|
| `settings` | JSON object | Có thể `{}` |
| `members[].role` | `OWNER` \| `ADMIN` \| `MEMBER` | |
| `members[].displayName` | string \| null | |

**Lỗi:** `403 FORBIDDEN`, `404 NOT_FOUND`.

---

### 6.4 Thêm member — `POST /groups/:groupId/members`

**Quyền:** group ADMIN/OWNER.  
Target phải đã là **org member**.

**Body:**

| Field | Rule | Mặc định |
|-------|------|----------|
| `userId` | UUID | — |
| `role` | `OWNER` \| `ADMIN` \| `MEMBER` | `MEMBER` |

**Success `201`:**

```json
{
  "member": {
    "groupId": "uuid",
    "userId": "uuid",
    "role": "MEMBER",
    "status": "ACTIVE"
  }
}
```

---

### 6.5 Xóa member — `DELETE /groups/:groupId/members/:userId`

**Success `200`:** `{ "ok": true }`

Side-effect: assignee ACTIVE của user trong task group → `REMOVED`; gỡ khỏi conversation group (internal).

---

## 7. Phase 1 — Task

Mọi path dưới `/groups/:groupId/tasks…` — cần **group member**.

### 7.1 Enum / trạng thái

| Field | Giá trị thường gặp |
|-------|-------------------|
| `task.status` | `TODO`, `IN_PROGRESS`, `DONE` (string) |
| `completionMode` | `ANY` (một người xong là xong) \| `ALL` (mọi assignee xong) |
| `assignee.status` | `ACTIVE`, `DONE`, `REMOVED` |
| `allowClaim` | `true`/`false` — cho phép tự nhận việc |

### 7.2 Tạo task — `POST /groups/:groupId/tasks`

**Body validation:**

| Field | Rule | Mặc định |
|-------|------|----------|
| `title` | string min 1 max 300 | — |
| `description` | string max 5000 | optional |
| `completionMode` | `ANY` \| `ALL` | `ANY` |
| `maxAssignees` | int dương | optional (null = không giới hạn) |
| `allowClaim` | boolean | `true` |
| `assigneeIds` | `string[]` UUID | optional |

**Success `201`:**

```json
{
  "task": {
    "id": "uuid",
    "groupId": "uuid",
    "code": "ENG-42",
    "title": "Viết tài liệu API",
    "status": "TODO"
  }
}
```

| Field | Ghi chú |
|-------|---------|
| `code` | Mã hiển thị (prefix 3 ký tự tên group + số seq) — dùng trong URL API sau này |
| Side-effect | Tạo conversation task; enqueue Google Tasks push (nếu user đã link Google) |

**Kiểm Flutter:** `title.trim()` không rỗng; mỗi `assigneeIds` là UUID; nếu gửi `maxAssignees` thì `> 0`.

---

### 7.3 List task — `GET /groups/:groupId/tasks`

**Success `200`:**

```json
{
  "tasks": [
    {
      "id": "uuid",
      "code": "ENG-42",
      "title": "…",
      "status": "TODO",
      "completionMode": "ANY",
      "maxAssignees": null,
      "allowClaim": true,
      "assignees": [
        {
          "userId": "uuid",
          "status": "ACTIVE",
          "email": "a@b.com",
          "displayName": "A"
        }
      ]
    }
  ]
}
```

Chỉ task `deletedAt == null`. Sort: mới trước.

---

### 7.4 Chi tiết task — `GET /groups/:groupId/tasks/:code`

**Path:** `code` = mã task (vd `ENG-42`), **không** phải UUID.

**Success `200`:** `{ "task": <Prisma Task đầy đủ> }`

Các trường chính trên object `task`:

| Field | Kiểu | Mô tả |
|-------|------|--------|
| `id` | UUID | |
| `groupId` | UUID | |
| `code` | string | |
| `title` | string | |
| `description` | string \| null | |
| `status` | string | |
| `completionMode` | string | |
| `maxAssignees` | int \| null | |
| `allowClaim` | bool | |
| `createdById` | UUID | |
| `version` | int | optimistic / event version |
| `createdAt` / `updatedAt` | ISO | |
| `deletedAt` | null (đã lọc) | |
| `assignees[]` | list | gồm `user: { id, email, displayName }` |
| `events[]` | list (tối đa 50) | lịch sử `TaskCreated`, `TaskClaimed`, … |

**Flutter:** parse linh hoạt — Prisma trả camelCase; nested `assignees[].user.displayName`.

---

### 7.5 Claim — `POST /groups/:groupId/tasks/:code/claim`

Body: không cần (empty / omit).

**Success:**

| HTTP | Body | Ý nghĩa |
|------|------|---------|
| `201` | `{ "ok": true, "taskId": "uuid", "claimed": true }` | Claim mới |
| `200` | `{ "ok": true, "taskId": "uuid", "claimed": false }` | Đã là assignee ACTIVE |

**Lỗi:**

| HTTP | `error` |
|------|---------|
| 400 | `CLAIM_DISABLED` |
| 409 | `CLAIM_FULL` |
| 404 | `NOT_FOUND` |

Claim thành công → task `status` thường thành `IN_PROGRESS`.

---

### 7.6 Assign — `POST /groups/:groupId/tasks/:code/assign`

**Quyền thực tế:** group admin (qua service).  
**Body:** `{ "userId": "<uuid>" }`

**Success `201`:** `{ "ok": true }`

---

### 7.7 Complete — `POST /groups/:groupId/tasks/:code/complete`

User phải là assignee **ACTIVE**.

**Success `200`:** `{ "ok": true }`

| `completionMode` | Hành vi |
|------------------|---------|
| `ANY` | Task → `DONE` ngay khi 1 người complete |
| `ALL` | Chỉ `DONE` khi không còn assignee ACTIVE |

**Lỗi:** `403 NOT_ASSIGNEE`, `404 NOT_FOUND`.

---

## 8. Phase 1.5 — Chat REST

Conversation được **core tạo giúp** khi tạo group/task — Flutter chủ yếu **list + gửi tin**, không gọi ensure.

### 8.1 List conversations — `GET /conversations`

**Success `200`:**

```json
{
  "conversations": [
    {
      "id": "uuid",
      "type": "GROUP",
      "groupId": "uuid",
      "taskId": null,
      "title": "Engineering",
      "lastReadSeq": 0
    }
  ]
}
```

| Field | Kiểu | Ý nghĩa |
|-------|------|---------|
| `type` | string | Thường `GROUP` hoặc `TASK` |
| `groupId` | UUID \| null | |
| `taskId` | UUID \| null | Thread theo task |
| `title` | string \| null | |
| `lastReadSeq` | int | Seq đã đọc — dùng badge unread |

**Unread gợi ý:** so sánh `lastReadSeq` với `max(message.seq)` khi đã load tin.

---

### 8.2 List messages — `GET /conversations/:id/messages?after_seq=`

| Query | Kiểu | Mặc định | Ý nghĩa |
|-------|------|----------|---------|
| `after_seq` | int | `0` | Chỉ lấy tin có `seq > after_seq` |

- `after_seq <= 0`: last-N (có thể từ Redis cache) — field `cached: true|false`.
- `after_seq > 0`: bù reconnect sau seq đã biết.

**Success `200`:**

```json
{
  "messages": [ /* Message */ ],
  "cached": false
}
```

Khi `after_seq > 0`, vẫn có `cached: false`.

#### Object Message (REST)

| Field | Kiểu | Mô tả |
|-------|------|--------|
| `id` | UUID | |
| `seq` | int | Thứ tự tăng trong conversation |
| `clientMsgId` | string \| null | Idempotency key từ client |
| `senderUserId` | UUID | |
| `body` | string | Rỗng nếu đã soft-delete |
| `replyToId` | UUID \| null | |
| `fileIds` | `string[]` | File READY đã gắn |
| `mentions` | `string[]` | UUID được mention |
| `reactions` | `{ emoji, count, me }[]` | Tổng hợp |
| `createdAt` | DateTime | |
| `editedAt` | DateTime \| null | |
| `deleted` | bool | |

**Lỗi:** `403 FORBIDDEN` nếu không còn member ACTIVE.

---

### 8.3 Gửi tin — `POST /conversations/:id/messages`

**Body validation:**

| Field | Rule |
|-------|------|
| `body` | string max 8000, default `""` |
| `clientMsgId` | string **min 8 max 64** — bắt buộc, unique theo conversation |
| `fileIds` | UUID[] max 10, optional — file phải **READY** cùng conversation |
| `replyToId` | UUID optional — tin cùng conv, chưa xóa |

**Rule nghiệp vụ:** `body.trim()` **hoặc** `fileIds` phải có ít nhất một; không thì `400 VALIDATION`.

Mention: trong `body` dùng `@<uuid>` — server lọc chỉ giữ member ACTIVE.

**Success:**

| HTTP | Ý nghĩa |
|------|---------|
| `201` | Tin mới `{ "message": { …, "conversationId": "…" } }` |
| `200` | Trùng `clientMsgId` → cùng message, có `deduped: true` trên object |

**Kiểm Flutter:**

1. Sinh `clientMsgId` = UUID không dấu / nanoid ≥ 8 ký tự; **giữ khi retry** để idempotent.
2. Optimistic UI: hiện tin local → khi 200/201 reconcile theo `clientMsgId` / `id`.
3. Rate-limit gửi tin → `RATE_LIMIT`.

---

### 8.4 Đánh dấu đã đọc — `POST /conversations/:id/read`

**Body:** `{ "seq": number int >= 0 }`

**Success `200`:**

```json
{ "ok": true, "lastReadSeq": 42 }
```

`lastReadSeq` = `max(seq hiện tại đã lưu, seq gửi lên)`.

---

### 8.5 Sửa tin — `PATCH /conversations/:id/messages/:messageId`

**Body:** `{ "body": string min1 max8000 }`  
Chỉ **sender** của tin; tin chưa xóa.

**Success `200`:** `{ "message": { …, "conversationId" } }`  
Socket emit `message:edited`.

---

### 8.6 Xóa tin — `DELETE /conversations/:id/messages/:messageId`

Soft-delete; chỉ sender.

**Success `200`:** `{ "message": { …, "deleted": true, "body": "", "conversationId" } }`  
Socket emit `message:deleted`.

---

## 9. Phase 1.5 — Socket.IO realtime

### 9.1 Kết nối

| | Giá trị |
|---|--------|
| Host | **chat-service** `:3204` (không qua gateway) |
| Path | `/socket.io` |
| Auth | `handshake.auth.token = accessToken` **hoặc** header `Authorization: Bearer …` |

Ví dụ (`socket_io_client`):

```dart
IO.io(
  EnvConfig.chatSocketUrl,
  IO.OptionBuilder()
      .setPath('/socket.io')
      .setAuth({'token': accessToken})
      .setTransports(['websocket'])
      .enableAutoConnect()
      .build(),
);
```

Fail auth → disconnect với error `UNAUTHORIZED`.

Khi connect: server tự `join` room `user:<userId>` (nhận mention).

### 9.2 Client → Server

| Event | Payload | Ack |
|-------|---------|-----|
| `join` | `{ conversationId }` | `{ ok: true }` hoặc `{ ok: false, error }` |
| `leave` | `{ conversationId }` | `{ ok: true }` |
| `typing` | `{ conversationId }` | (không bắt buộc ack) |
| `auth:refresh` | `{ token }` | `{ ok: true }` hoặc `{ ok: false, error: "UNAUTHORIZED" }` rồi disconnect |

**join:** chỉ member ACTIVE; room name `conv:<conversationId>`.

### 9.3 Server → Client

| Event | Payload chính |
|-------|----------------|
| `message:new` | Message + `conversationId` |
| `message:edited` | Message + `conversationId` |
| `message:deleted` | Message + `conversationId` |
| `reaction:changed` | `{ conversationId, messageId, userId, removed, emoji }` |
| `typing` | `{ conversationId, userId }` (không echo về chính mình) |
| `mention:notify` | `{ conversationId, messageId, fromUserId, preview }` |

### 9.4 Chiến lược Flutter

1. Sau login: mở socket với access token.
2. Vào màn chat: `join` conversation; rời màn: `leave`.
3. Access sắp hết hạn: gọi `auth:refresh` với JWT mới (khi có refresh API) hoặc reconnect với token mới.
4. Reconnect: `GET messages?after_seq=<lastSeq>` rồi lắng nghe lại `message:new`.
5. Presence Redis TTL 120s — client không cần API presence riêng ở Phase này.

---

## 10. Phase 1.6 — File đính kèm

Giới hạn mặc định: **`MAX_FILE_BYTES` = 2GB**; signed PUT TTL ~3600s; GET ~300s.

### 10.1 Init upload — `POST /files/init`

**Body:**

| Field | Rule |
|-------|------|
| `conversationId` | UUID |
| `originalName` | string 1–255 |
| `contentType` | string max 128 optional |
| `sizeBytes` | int dương |
| `sha256` | hex đúng **64** ký tự optional (để dedup) |

**Success `201`:**

```json
{
  "fileId": "uuid",
  "deduped": false,
  "status": "UPLOADING",
  "putUrl": "https://…signed…",
  "objectKey": "chat/…/…"
}
```

Nếu dedup READY cùng group + sha256:

```json
{
  "fileId": "uuid-đã-có",
  "deduped": true,
  "status": "READY",
  "putUrl": null
}
```

**Lỗi:** `413 FILE_TOO_LARGE`, `400 FILE_TYPE_BLOCKED`, `413 GROUP_QUOTA_EXCEEDED`, `403 FORBIDDEN`.

### 10.2 Upload binary

Client **PUT** file lên `putUrl` (MinIO), **không** gửi qua gateway.

### 10.3 Complete — `POST /files/:id/complete`

**Body (optional):** `{ "sha256": "64-hex" }`

**Success `200` — object File:**

| Field | Kiểu |
|-------|------|
| `id` | UUID |
| `originalName` | string |
| `contentType` | string \| null |
| `sizeBytes` | number |
| `sha256` | string \| null |
| `status` | `READY` (thành công) |
| `scanStatus` | `CLEAN` / … |

**Lỗi scan / size:** `FILE_VIRUS`, `FILE_TYPE_BLOCKED`, `FILE_SIZE_MISMATCH`, `FILE_HASH_MISMATCH`, `UPLOAD_INCOMPLETE`, …

### 10.4 Download URL — `GET /files/:id/download`

**Success `200`:**

```json
{
  "url": "https://…signed GET…",
  "file": { /* File map */ },
  "contentDisposition": "inline | attachment"
}
```

`inline` cho image/* và PDF; còn lại `attachment`.

### 10.5 List file conversation — `GET /conversations/:id/files`

**Success:** `{ "files": [ File, … ] }` (tối đa 100, READY, mới trước).

### 10.6 Luồng Flutter gửi tin kèm file

```
1. POST /files/init
2. nếu !deduped → PUT bytes lên putUrl
3. POST /files/:id/complete → status READY
4. POST /conversations/:id/messages { body, clientMsgId, fileIds: [fileId] }
```

---

## 11. Phase 1.7 — Reaction, search, push token

### 11.1 Toggle reaction — `POST /conversations/:id/messages/:messageId/reactions`

**Body:** `{ "emoji": string min1 max32 }`

**Success `200`:**

| Kết quả | Body |
|---------|------|
| Thêm | `{ "removed": false, "emoji": "👍" }` |
| Gỡ (toggle lại cùng emoji) | `{ "removed": true, "emoji": "👍" }` |

Socket: `reaction:changed` kèm `userId`.

---

### 11.2 List reactions — `GET /conversations/:id/messages/:messageId/reactions`

```json
{
  "reactions": [
    { "emoji": "👍", "count": 3, "me": true }
  ]
}
```

---

### 11.3 Search tin — `GET /conversations/:id/search?q=&limit=&groupId=&taskId=`

| Query | Rule |
|-------|------|
| `q` | trim length ≥ **2** |
| `limit` | optional, mặc định 30, max 100 |
| `groupId` / `taskId` | optional filter khớp conversation |

**Success:**

```json
{
  "messages": [
    {
      "id": "uuid",
      "seq": 10,
      "body": "…",
      "highlight": "…đoạn highlight…",
      "senderUserId": "uuid",
      "createdAt": "…"
    }
  ],
  "filter": {
    "conversationId": "uuid",
    "groupId": "uuid|null",
    "taskId": "uuid|null"
  }
}
```

---

### 11.4 Push device token

Platform hợp lệ (lowercase): `ios`, `android`, `web`, `fcm`, `apns`.

#### `POST /devices/push-token` → `201`

**Body:** `{ "platform": "android", "token": string 8–512 }`

**Response:** `{ "id", "platform", "token" }`

#### `DELETE /devices/push-token` → `200`

**Body:** `{ "token": "…" }` → `{ "ok": true }`

#### `GET /devices/push-token` → `200`

```json
{
  "tokens": [
    { "id": "uuid", "platform": "android", "token": "…", "updatedAt": "…" }
  ]
}
```

> Worker push hiện là **stub** (chưa FCM thật) — vẫn nên đăng ký token để sẵn sàng.

---

## 12. Phase 2 / 2.5 — Google Tasks sync

Điều kiện: user đã login Google với scope Tasks (id-token + `serverAuthCode` hoặc OAuth web).

### 12.1 Trigger pull — `POST /sync/tasks/pull`

Bearer; không body.

**Success `202`:**

```json
{
  "jobId": "uuid",
  "deduped": false,
  "skipped": false
}
```

Hoặc job đang chạy: `deduped: true`.  
(Client luôn `force: true` nên ít gặp `skipped: cooldown`.)

### 12.2 Full sync — `POST /sync/tasks/full`

**Success `202`:**

```json
{
  "pushCount": 3,
  "pull": { "jobId": "uuid", "deduped": false, "skipped": false }
}
```

Đẩy các task assignee ACTIVE chưa DONE + pull force.

### 12.3 Trạng thái sync — `GET /sync/status`

```json
{
  "googleLinked": true,
  "tasksLastPullAt": "2026-09-28T…Z | null",
  "tasksSyncCursor": "string | null",
  "tasksPollIntervalS": 300,
  "tasksNextPollAt": "… | null",
  "backlog": {
    "pending": 0,
    "retry": 0,
    "failed": 0,
    "authRequired": 0
  },
  "linkedTasks": 12,
  "recentJobs": [
    {
      "id": "uuid",
      "jobType": "TASKS_PULL",
      "status": "PENDING|RETRY|RUNNING|FAILED|AUTH_REQUIRED|…",
      "attempts": 0,
      "lastError": null,
      "nextRunAt": "…",
      "updatedAt": "…",
      "aggregateId": "uuid"
    }
  ]
}
```

**UI gợi ý:**

- `googleLinked == false` → CTA liên kết Google.
- `backlog.authRequired > 0` → yêu cầu login Google lại / cấp refresh token.
- `failed` → hiện lỗi gần nhất từ `recentJobs[].lastError`.

### 12.4 Sheet status (Phase 4) — xem tài liệu riêng

Phase 4–5 (Sheets ensure/push/pull + metrics):  
[`huong-dan-ghep-api-phase-4-5.md`](./huong-dan-ghep-api-phase-4-5.md)

Tóm tắt nhanh:

| Method | Path | Auth |
|--------|------|------|
| GET | `/sync/sheets/:groupId` | Bearer |
| POST | `/sync/sheets/:groupId/ensure` | Bearer |
| POST | `/sync/sheets/:groupId/push` | Bearer |
| POST | `/sync/sheets/:groupId/pull` | Bearer |

Push task app → Google **Tasks**: vẫn tự enqueue khi tạo/assign (Phase 2).  
Push **Sheets**: Flutter gọi `POST .../push` (debounce ~45s).

---

## 13. Phase 3 — Google Chat (Flutter cần biết gì)

| Thành phần | Ai gọi | Flutter |
|------------|--------|---------|
| `POST /google-chat/webhook` | Google | Không |
| Internal events / bridge / ingest | google-sync ↔ chat | Không |
| Tin `origin=GOOGLE_CHAT` trong conversation | Server ingest | Hiện như tin thường (cùng Message schema) |

**Flutter Phase 3:** chủ yếu đảm bảo chat UI hiển thị tin sync từ Google Chat; không tự gọi webhook.

Hoàn thành task từ Chat bot đi qua internal core — user trên app thấy status `DONE` khi refresh list task.

---

## 14. Luồng nghiệp vụ end-to-end

### 14.1 Onboarding Internal Alpha

```
Register → Verify OTP → Login
  → POST /organizations
  → POST /organizations/:orgId/groups
  → (invite/accept nếu cần)
  → POST /groups/:groupId/members
  → POST /groups/:groupId/tasks
  → GET /conversations  → mở thread GROUP/TASK
  → Socket join + POST messages
```

### 14.2 Chat + file

```
init file → PUT MinIO → complete → postMessage(fileIds)
  ↔ socket message:new
  → markRead(seq)
```

### 14.3 Google Tasks

```
Login Google (id-token + serverAuthCode)
  → tạo/claim task (auto push)
  → POST /sync/tasks/pull hoặc /sync/tasks/full
  → GET /sync/status (poll UI)
```

---

## 15. Model Dart gợi ý

```dart
class ApiErrorBody {
  ApiErrorBody({required this.error, this.message, this.details});
  final String error;
  final String? message;
  final dynamic details;

  factory ApiErrorBody.fromJson(Map<String, dynamic> j) => ApiErrorBody(
        error: j['error'] as String,
        message: j['message'] as String?,
        details: j['details'],
      );
}

class OrganizationItem {
  OrganizationItem({required this.id, required this.name, required this.role});
  final String id;
  final String name;
  final String role; // OWNER | ADMIN | MEMBER

  factory OrganizationItem.fromJson(Map<String, dynamic> j) => OrganizationItem(
        id: j['id'] as String,
        name: j['name'] as String,
        role: j['role'] as String,
      );
}

class GroupSummary {
  GroupSummary({
    required this.id,
    required this.organizationId,
    required this.name,
    this.myRole,
  });
  final String id;
  final String organizationId;
  final String name;
  final String? myRole;

  factory GroupSummary.fromJson(Map<String, dynamic> j) => GroupSummary(
        id: j['id'] as String,
        organizationId: j['organizationId'] as String,
        name: j['name'] as String,
        myRole: j['myRole'] as String?,
      );
}

class TaskListItem {
  TaskListItem({
    required this.id,
    required this.code,
    required this.title,
    required this.status,
    required this.completionMode,
    required this.allowClaim,
    this.maxAssignees,
    required this.assignees,
  });
  final String id;
  final String code;
  final String title;
  final String status;
  final String completionMode;
  final bool allowClaim;
  final int? maxAssignees;
  final List<TaskAssigneeBrief> assignees;

  factory TaskListItem.fromJson(Map<String, dynamic> j) => TaskListItem(
        id: j['id'] as String,
        code: j['code'] as String,
        title: j['title'] as String,
        status: j['status'] as String,
        completionMode: j['completionMode'] as String,
        allowClaim: j['allowClaim'] as bool,
        maxAssignees: j['maxAssignees'] as int?,
        assignees: (j['assignees'] as List<dynamic>)
            .map((e) => TaskAssigneeBrief.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class TaskAssigneeBrief {
  TaskAssigneeBrief({
    required this.userId,
    required this.status,
    required this.email,
    this.displayName,
  });
  final String userId;
  final String status;
  final String email;
  final String? displayName;

  factory TaskAssigneeBrief.fromJson(Map<String, dynamic> j) => TaskAssigneeBrief(
        userId: j['userId'] as String,
        status: j['status'] as String,
        email: j['email'] as String,
        displayName: j['displayName'] as String?,
      );
}

class ConversationItem {
  ConversationItem({
    required this.id,
    required this.type,
    this.groupId,
    this.taskId,
    this.title,
    required this.lastReadSeq,
  });
  final String id;
  final String type;
  final String? groupId;
  final String? taskId;
  final String? title;
  final int lastReadSeq;

  factory ConversationItem.fromJson(Map<String, dynamic> j) => ConversationItem(
        id: j['id'] as String,
        type: j['type'] as String,
        groupId: j['groupId'] as String?,
        taskId: j['taskId'] as String?,
        title: j['title'] as String?,
        lastReadSeq: j['lastReadSeq'] as int,
      );
}

class ChatMessage {
  ChatMessage({
    required this.id,
    required this.seq,
    this.clientMsgId,
    required this.senderUserId,
    required this.body,
    this.replyToId,
    required this.fileIds,
    required this.mentions,
    required this.reactions,
    required this.createdAt,
    this.editedAt,
    required this.deleted,
    this.conversationId,
    this.deduped,
  });

  final String id;
  final int seq;
  final String? clientMsgId;
  final String senderUserId;
  final String body;
  final String? replyToId;
  final List<String> fileIds;
  final List<String> mentions;
  final List<ReactionAgg> reactions;
  final DateTime createdAt;
  final DateTime? editedAt;
  final bool deleted;
  final String? conversationId;
  final bool? deduped;

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: j['id'] as String,
        seq: j['seq'] as int,
        clientMsgId: j['clientMsgId'] as String?,
        senderUserId: j['senderUserId'] as String,
        body: j['body'] as String? ?? '',
        replyToId: j['replyToId'] as String?,
        fileIds: (j['fileIds'] as List<dynamic>? ?? const [])
            .map((e) => e as String)
            .toList(),
        mentions: (j['mentions'] as List<dynamic>? ?? const [])
            .map((e) => e as String)
            .toList(),
        reactions: (j['reactions'] as List<dynamic>? ?? const [])
            .map((e) => ReactionAgg.fromJson(e as Map<String, dynamic>))
            .toList(),
        createdAt: DateTime.parse(j['createdAt'].toString()),
        editedAt: j['editedAt'] != null
            ? DateTime.parse(j['editedAt'].toString())
            : null,
        deleted: j['deleted'] as bool? ?? false,
        conversationId: j['conversationId'] as String?,
        deduped: j['deduped'] as bool?,
      );
}

class ReactionAgg {
  ReactionAgg({required this.emoji, required this.count, required this.me});
  final String emoji;
  final int count;
  final bool me;

  factory ReactionAgg.fromJson(Map<String, dynamic> j) => ReactionAgg(
        emoji: j['emoji'] as String,
        count: j['count'] as int,
        me: j['me'] as bool? ?? false,
      );
}

class SyncStatus {
  SyncStatus({
    required this.googleLinked,
    this.tasksLastPullAt,
    required this.backlog,
    required this.linkedTasks,
    required this.recentJobs,
  });

  final bool googleLinked;
  final DateTime? tasksLastPullAt;
  final SyncBacklog backlog;
  final int linkedTasks;
  final List<Map<String, dynamic>> recentJobs;

  factory SyncStatus.fromJson(Map<String, dynamic> j) => SyncStatus(
        googleLinked: j['googleLinked'] as bool,
        tasksLastPullAt: j['tasksLastPullAt'] != null
            ? DateTime.parse(j['tasksLastPullAt'].toString())
            : null,
        backlog: SyncBacklog.fromJson(j['backlog'] as Map<String, dynamic>),
        linkedTasks: j['linkedTasks'] as int,
        recentJobs: (j['recentJobs'] as List<dynamic>)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList(),
      );
}

class SyncBacklog {
  SyncBacklog({
    required this.pending,
    required this.retry,
    required this.failed,
    required this.authRequired,
  });
  final int pending;
  final int retry;
  final int failed;
  final int authRequired;

  factory SyncBacklog.fromJson(Map<String, dynamic> j) => SyncBacklog(
        pending: j['pending'] as int,
        retry: j['retry'] as int,
        failed: j['failed'] as int,
        authRequired: j['authRequired'] as int,
      );
}
```

Auth models (`LoginResponse`, `MeResponse`, …) đã có trong `lib/features/auth/data/auth_models.dart`.

---

## 16. Bảng mã lỗi tổng hợp

| `error` | HTTP thường | Module |
|---------|-------------|--------|
| `VALIDATION` | 400 | Mọi nơi (Zod / rule tay) |
| `UNAUTHORIZED` | 401 | JWT / internal |
| `FORBIDDEN` | 403 | Không đủ quyền member/admin |
| `NOT_FOUND` | 404 | Resource |
| `RATE_LIMIT` | 429 | Gateway / chat |
| `EMAIL_TAKEN` | 409 | Auth |
| `EMAIL_NOT_VERIFIED` | 403 | Auth |
| `INVALID_CREDENTIALS` | 401 | Auth |
| `INVALID_OTP` / `OTP_LOCKED` | 400 / 429 | Auth |
| `TOKEN_REVOKED` | 401 | Auth me |
| `INVITE_INVALID` / `INVITE_EXPIRED` | 410 | Org |
| `INVITE_EMAIL_MISMATCH` | 403 | Org |
| `EMAIL_SEND_FAILED` | 503 | Org invite / OTP |
| `CLAIM_DISABLED` | 400 | Task |
| `CLAIM_FULL` | 409 | Task |
| `NOT_ASSIGNEE` | 403 | Task complete |
| `FILE_TOO_LARGE` | 413 | File |
| `FILE_TYPE_BLOCKED` / `FILE_VIRUS` | 400 | File |
| `FILE_NOT_READY` | 400 | Chat + file |
| `GROUP_QUOTA_EXCEEDED` | 413 | File |
| `UPLOAD_INCOMPLETE` | 400 | File |
| `BAD_GATEWAY` | 502 | Gateway |
| `INTERNAL` | 500 | Unhandled |
| `NOT_FOUND` (path) | 404 | Gateway không khớp route |

---

## 17. Checklist ghép Flutter

### Nền tảng

- [ ] `API_*_URL` trỏ gateway `:3200`; Android dùng `10.0.2.2`
- [ ] Dio interceptor gắn `Authorization: Bearer`
- [ ] Map lỗi → `ApiException(code: error, message: message)`
- [ ] Secure storage cho access + refresh; logout = clear local

### Phase 1

- [ ] Auth flows (xem checklist trong `huong-dan-ghep-api-auth.md`)
- [ ] CRUD org: create / list / invite / accept
- [ ] Group: create / list / detail / add-remove member
- [ ] Task: create / list / detail-by-**code** / claim / assign / complete
- [ ] Hiển thị `code` trên UI; API path dùng `code` không dùng `id` (trừ khi response trả `id`)

### Phase 1.5–1.7

- [ ] List conversations; badge unread từ `lastReadSeq`
- [ ] Messages + `after_seq` reconnect
- [ ] Gửi tin với `clientMsgId` ổn định khi retry
- [ ] Socket connect `:3204`, `join`/`leave`, lắng nghe `message:*`
- [ ] Upload file 3 bước + gắn `fileIds`
- [ ] Reaction toggle; search `q.length >= 2`
- [ ] Đăng ký `/devices/push-token` theo platform

### Phase 2

- [ ] Google login kèm `serverAuthCode` nếu cần Tasks
- [ ] Nút “Đồng bộ” → `POST /sync/tasks/pull` hoặc `/full`
- [ ] Màn trạng thái từ `GET /sync/status` (`googleLinked`, `authRequired`)

### Phase 3

- [ ] Chat UI không filter mất tin ingest từ Google Chat
- [ ] Không gọi webhook từ app

### Kiểm thử tay tối thiểu

1. Register → OTP → Login → `/auth/me`
2. Tạo org → group → task → thấy conversation
3. Hai user cùng group: Socket nhận `message:new`
4. Upload ảnh nhỏ → gửi tin kèm file → download URL
5. Link Google → tạo task → `/sync/status` thấy job / `linkedTasks`

---

## Phụ lục A — Bảng endpoint Flutter (tóm tắt)

| Phase | Method | Path |
|-------|--------|------|
| 1 Auth | * | `/auth/*` (xem §4) |
| 1 Org | POST/GET | `/organizations` |
| 1 Org | POST | `/organizations/:orgId/invitations` |
| 1 Org | POST | `/invitations/org/accept` |
| 1 Group | POST/GET | `/organizations/:orgId/groups` |
| 1 Group | GET | `/groups/:groupId` |
| 1 Group | POST/DELETE | `/groups/:groupId/members[/:userId]` |
| 1 Task | POST/GET | `/groups/:groupId/tasks` |
| 1 Task | GET | `/groups/:groupId/tasks/:code` |
| 1 Task | POST | `/groups/:groupId/tasks/:code/claim\|complete\|assign` |
| 1.5 | GET/POST… | `/conversations…` |
| 1.6 | POST/GET | `/files…` |
| 1.7 | POST/GET | `…/reactions`, `…/search`, `/devices/push-token` |
| 2 | POST/GET | `/sync/tasks/pull`, `/sync/tasks/full`, `/sync/status` |

---

## Phụ lục B — Nguồn sự thật trong repo

| Nội dung | File |
|----------|------|
| Gateway proxy + JWT | `backend/apps/api-gateway/src/index.ts`, `middlewares/auth-guard.ts` |
| Zod org/group/task | `backend/apps/core-service/src/modules/_shared/core.schemas.ts` |
| Zod chat | `backend/apps/chat-service/src/modules/conversation/conversation.schemas.ts` |
| Socket | `backend/apps/chat-service/src/realtime/socket.ts` |
| Sync client | `backend/apps/google-sync-service/src/modules/sync/sync.controller.ts` |
| Auth guide | `frontend/docs/huong-dan-ghep-api-auth.md` |

---

*Tài liệu khớp code backend tại thời điểm viết. Khi schema/response đổi, ưu tiên controller + Zod trong repo.*
