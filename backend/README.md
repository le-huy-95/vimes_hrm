# manage-teams backend

Monorepo pnpm + turbo. Client (Flutter) chỉ gọi **api-gateway**; gateway proxy tới các service nghiệp vụ.

## Mục đích từng service (`apps/`)

### api-gateway — cổng vào duy nhất (`:3200`)

**Dùng để:** nhận mọi request HTTP từ client; không chứa logic nghiệp vụ.

- CORS, correlation id, rate-limit (auth vs API chung)
- Xác minh JWT (trừ path public như `/auth/login`, `/auth/register`, `/ai/ping`)
- Proxy:
  - `/auth/*` → identity-service
  - `/organizations`, `/invitations`, `/groups/*` → core-service
  - `/conversations/*` → chat-service
  - `/ai/*` → ai-service

**Khi scale:** tăng replica gateway khi RPS edge cao.

---

### identity-service — xác thực & tài khoản (`:3202`)

**Dùng để:** vòng đời user trước/sau đăng nhập.

| Module | Chức năng |
|--------|-----------|
| `modules/login` | Đăng nhập email/password, Google OAuth (PKCE, id-token) |
| `modules/auth` | Đăng ký, OTP xác minh email, quên/đặt lại mật khẩu, `/auth/me`, liên kết Google |

Gửi email OTP qua **worker-service**. Đọc/ghi DB qua `prismaRead` / `prismaWrite`.

**Khi scale:** tăng replica khi spike đăng nhập (đầu năm, campaign).

---

### core-service — nghiệp vụ tổ chức (`:3203`)

**Dùng để:** quản lý org, nhóm, task — phần “làm việc nhóm”.

| Module | Chức năng |
|--------|-----------|
| `modules/org` | Tạo org, mời thành viên, chấp nhận lời mời |
| `modules/group` | CRUD nhóm, thêm/xóa thành viên |
| `modules/task` | Task trong group, assign, claim, hoàn thành |
| `modules/access` | Kiểm tra quyền org/group |

Ghi outbox event (Kafka) khi task thay đổi; gọi chat internal API để tạo conversation task/group.

**Khi scale:** replica core; list nặng dùng `prismaRead` (replica sau này).

---

### chat-service — hội thoại & realtime (`:3204`)

**Dùng để:** chat nhóm/task + Socket.IO.

| Phần | Chức năng |
|------|-----------|
| `modules/conversation` | REST list/send/edit/delete, mark read, `after_seq` bù reconnect |
| `realtime/socket` | Socket.IO + Redis: join, typing, `auth:refresh`, presence |
| `infra/message-cache` | Redis last-N (`cache:conv:*`) |
| Rate-limit | `CHAT_RATE_LIMIT_PER_MIN` khi gửi tin |

Internal API (core gọi): ensure group/task conversation, remove member.

**Khi scale:** replica chat; sau có thể tách `realtime/` thành process riêng.

---

### google-sync-service — Google Tasks (`:3207`)

**Dùng để:** đồng bộ một chiều app → Google Tasks (Phase 2).

- Bảng `sync_jobs` + `google_task_links` (migration `004`)
- Core enqueue khi tạo task → worker poll → Tasks API
- Limiter in-memory; `AUTH_REQUIRED` khi thiếu/hết hạn Google token

Chạy: `pnpm --filter @manage-teams/google-sync-service dev`

---

### worker-service — tác vụ nền (`:3206`)

**Dùng để:** xử lý bất đồng bộ, không block HTTP.

- Gửi email: OTP xác minh, reset mật khẩu, mời org (Handlebars templates)
- Endpoint nội bộ `/internal/email/*` (identity/core gọi qua `WORKER_URL`)
- Sau này: consume Kafka outbox (side-effects)

**Khi scale:** tăng consumer khi hàng đợi email/event dài.

---

### ai-service — AI (scaffold) (`:3205`)

**Dùng để:** chỗ gắn tính năng AI sau này (inference, embedding, gợi ý task…).

Hiện tại: `GET /health`, `POST /ai/ping` (echo). Gateway proxy `/ai/*`.

**Khi scale:** replica riêng; có thể dùng GPU node.

---

## Packages dùng chung

| Package | Mục đích |
|---------|----------|
| `@manage-teams/lib` | HTTP errors, JWT, crypto, logger, health — JSDoc tiếng Việt |
| `@manage-teams/db` | Prisma: `prismaWrite` (ghi), `prismaRead` (đọc); `DATABASE_URL_READ` tùy chọn |
| `@manage-teams/contracts` | Schema event Kafka |
| `@manage-teams/kafka-client` | Producer/consumer helper |
| `@manage-teams/outbox` | Transactional outbox |

## Cấu trúc trong mỗi app

```
src/
  index.ts          # bootstrap / listen
  app.ts            # Express assembly
  modules/<name>/   # routes → controller → service (+ dto)
  infra/            # oauth, mailer, outbox…
  realtime/         # (chat) Socket.IO
  utils/            # helper local
tests/              # unit test (tách khỏi src)
```

## Dev

```bash
cp .env.example .env
pnpm install          # tự build lib + db (postinstall)
pnpm dev              # hoặc chạy từng filter
```

Chạy riêng một service:

```bash
pnpm --filter @manage-teams/api-gateway dev
pnpm --filter @manage-teams/identity-service dev
pnpm --filter @manage-teams/core-service dev
pnpm --filter @manage-teams/chat-service dev
pnpm --filter @manage-teams/worker-service dev
pnpm --filter @manage-teams/ai-service dev
pnpm --filter @manage-teams/google-sync-service dev
```

Migrate DB (gồm `004_google_sync_jobs`):

```bash
pnpm --filter @manage-teams/db migrate
```

Nếu IDE báo đỏ `@manage-teams/lib` / `@manage-teams/db`: chạy `pnpm run build:deps` hoặc mở folder `backend/` làm workspace root (file `backend/tsconfig.json` có project references).
