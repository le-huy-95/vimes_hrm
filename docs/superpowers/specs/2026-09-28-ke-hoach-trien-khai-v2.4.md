# Kế hoạch triển khai chi tiết – v2.4

Hệ thống quản lý công việc nhóm tích hợp Google (Tasks, Sheets, Chat), chat và file trong app, cùng trợ lý AI.

> **Trạng thái:** Lưu trong repo làm tài liệu gốc + checklist phase chi tiết. **Nguồn chuẩn quyết định:** [v2.5 design](./2026-09-28-ke-hoach-trien-khai-v2.5-design.md) — khi xung đột, theo v2.5.

> Tài liệu tổng hợp các quyết định từ v2 đến v2.4 và bổ sung phần kế hoạch thực thi (đầu việc, tiêu chí nghiệm thu, phụ thuộc, rủi ro). Các mục đánh dấu **[CHƯA XÁC MINH]** cần spike hoặc đọc lại tài liệu chính thức của Google/Anthropic trước khi cam kết.

---

## 1. Mục tiêu và phạm vi

### 1.1 Mục tiêu
1. Quản lý nhóm, task đa assignee, nhận việc, chuyển việc, audit.
2. Chat trong app (nhóm, bình luận task, DM), gửi file mọi loại, realtime, không đặt giới hạn nhân tạo.
3. Đồng bộ với Google Tasks (hai chiều theo trường), Google Sheets (báo cáo), Google Chat (bot tương tác).
4. Trợ lý AI: hỏi đáp toàn hệ thống, trả link thực thể, thao tác thay người dùng có xác nhận.
5. Chạy được cho cả Google Workspace và Gmail cá nhân (ở mức có thể; xem spike Phase 3).

### 1.2 Ngoài phạm vi (giai đoạn đầu)
- Domain-wide delegation.
- Bridge Google Chat hai chiều (Phase 3.5, tuỳ chọn).
- AI phân loại tin nhắn, OCR file, chuyển mã video.
- AI thêm/xoá thành viên, xoá nhóm, xoá dữ liệu hàng loạt (không bao giờ có công cụ xoá hàng loạt).

### 1.3 Nguyên tắc thiết kế
1. DB nội bộ là nguồn chuẩn. Google Tasks/Sheets/Chat chỉ là bản chiếu.
2. Chỉ tách service khi có lý do về scale, quota hoặc failure domain.
3. Kafka cho mọi thay đổi trạng thái giữa các service; realtime tới client đi đường riêng (Redis + WebSocket).
4. Không gọi Google từ luồng nghiệp vụ; mọi lời gọi đi qua `sync_jobs` (gom, debounce, khử trùng lặp).
5. Push ở nơi Google có push, poll theo sự kiện chứ không theo đồng hồ.
6. Nghiệp vụ lõi và chat chạy độc lập với Google; Google lỗi thì app vẫn dùng bình thường.
7. Chỉ dùng OAuth theo từng người.
8. AI nhân danh người dùng, không có quyền riêng; mô hình không chạm DB; link do server sinh; ghi/xoá cần người dùng xác nhận; nội dung chat/file là dữ liệu không tin cậy.

---

## 2. Kiến trúc tổng thể

### 2.1 Danh sách service (7)

| # | Service | Trách nhiệm |
|---|---------|-------------|
| 1 | `api-gateway` | JWT, rate limit, correlation-id, định tuyến, hỗ trợ SSE cho `/ai/*` |
| 2 | `identity-service` | Google OAuth2 (PKCE), JWT, lưu Google token mã hoá, `google_sub`, `account_type`, phát `UserLoggedIn`, cấp token nhân danh cho AI |
| 3 | `core-service` | Group, task, đa assignee, transfer, audit, outbox. Một DB, giao dịch thật |
| 4 | `chat-service` | Hội thoại, tin nhắn, file, WebSocket (Socket.IO + Redis), media worker |
| 5 | `google-sync-service` | Planner, `sync_jobs`, worker Tasks/Sheets, poller, delta sync, limiter, webhook Drive |
| 6 | `messaging-service` | Chat app HTTP endpoint (bot), email, thông báo, digest; sau này bridge + ingest Events API |
| 7 | `ai-service` | Orchestrator LLM, tool registry, link resolver, retrieval, guardrails, audit, đo chi phí |

### 2.2 Sơ đồ luồng

```
Web/Mobile ──REST──► api-gateway ──► identity | core | chat | ai
     │                                   (sync, messaging: nội bộ)
     ├──WebSocket──► chat-service ◄──► Redis (fan-out, presence, typing)
     └──SSE──────► api-gateway ──► ai-service

core / chat ──outbox──► KAFKA
   task.events, group.events, chat.events, user.events,
   media.events, google.sync.commands, google.signals, *.dlq
        │
        ├─► google-sync-service ──► Google Tasks / Sheets
        ├─► messaging-service   ──► Google Chat / Email
        ├─► chat-service (media worker: quét virus, thumbnail, trích văn bản)
        └─► ai-service (Indexer ─► pgvector)

Google Chat ──HTTP interaction──► messaging ──REST──► core / ai
Drive push ──► webhook của google-sync
```

### 2.3 Kafka

| Topic | Key | Producer → Consumer |
|-------|-----|---------------------|
| `group.events` | groupId | core → chat, google-sync, messaging |
| `task.events` | taskId | core → google-sync, messaging, chat, ai (indexer) |
| `chat.events` | conversationId | chat → messaging, thông báo, tìm kiếm, ai (indexer) |
| `media.events` | fileId | chat → media worker, ai (`FileTextExtracted`) |
| `user.events` | userId | identity → google-sync, messaging |
| `google.sync.commands` | user/group/space | planner → worker |
| `google.signals` | taskId | poller, webhook → core |
| `*.dlq` | key gốc | consumer → công cụ replay |

Quy ước bắt buộc: một topic cho mỗi aggregate; `aggregateVersion` trong envelope; consumer bỏ event cũ; idempotent (`processed_events`); Transactional Outbox ở mọi service phát event; envelope có `eventId`, `correlationId`, `actor.via` (`user` | `ai-assistant` | `google` | `system`).

### 2.4 Tech stack
Node.js LTS, Express, TypeScript, Socket.IO (Redis adapter), Postgres (Prisma hoặc Drizzle), Redis, kafkajs, Zod, MinIO/GCS/S3/R2 (sau `StorageProvider`), ClamAV, pgvector, Vitest + Testcontainers, googleapis, pnpm + Turborepo, OpenTelemetry + pino.

### 2.5 Cấu trúc monorepo
```
/apps      api-gateway identity-service core-service chat-service
           google-sync-service messaging-service ai-service
/packages  contracts kafka-client outbox google-limiter storage llm-provider common
/infra     docker-compose, k8s/terraform, dashboards
/docs      ADR, runbook, API spec
```

---

## 3. Mô hình dữ liệu

### 3.1 core-service
- `groups(settings jsonb)`, `group_members(role OWNER|ADMIN|MEMBER, status)`, `invitations`
- `tasks(code, completion_mode ANY|ALL, max_assignees, allow_claim, version, deleted_at)`
- `task_assignees(task_id, user_id, status ACTIVE|DONE|REMOVED, personal_note, completed_at, completed_source APP|CHAT|GOOGLE)`
- `task_transfers(from_user, to_user, status, expires_at)`
- `task_events` (append-only), `outbox`, `processed_events`

### 3.2 chat-service
- `conversations(type GROUP|TASK_THREAD|DM, group_id, task_id, last_seq)`
- `conversation_members(conversation_id, user_id, last_read_seq, muted)`
- `messages(conversation_id, seq, client_msg_id, sender_id, body, reply_to_id, thread_root_id, origin APP|GOOGLE_CHAT, edited_at, deleted_at)` – phân vùng theo tháng; unique `(conversation_id, seq)` và `(conversation_id, client_msg_id)`
- `attachments`, `files(sha256, storage_key, size, mime, status UPLOADING|SCANNING|READY|BLOCKED, thumbnail_key)`, `reactions`, `mentions`
- `outbox`, `processed_events`

### 3.3 google-sync-service
- `google_links(task_id, user_id, google_ref, etag, content_hash, base_snapshot, field_hashes, state CREATING|SYNCED|STALE|AUTH_REQUIRED|DETACHED)`
- `sync_jobs`, `sync_state(user_id, resource, cursor, status)`, `poll_schedule(interval_s, empty_streak)`, `drive_watch_channels(file_id, channel_id, expires_at)`

### 3.4 messaging-service
- `notification_deliveries`, `chat_processed_events`
- Giai đoạn bridge: `google_message_map`, `chat_subscriptions`, `chat_ingest_state`

### 3.5 ai-service
- `ai_sessions`, `ai_messages(role, content, tool_calls, model, tokens_in, tokens_out)`
- `ai_pending_actions(tool, args, summary, status PENDING|CONFIRMED|REJECTED|EXPIRED|EXECUTED|FAILED, idempotency_key, expires_at)`
- `ai_audit(tool, args_redacted, result_status, latency_ms)`, `ai_usage(user_id, day, tokens_in, tokens_out)`
- `embeddings(chunk_id, source_type, source_id, group_id, text, embedding, source_updated_at)`
- Cấu hình nhóm: `settings.ai_enabled`, `settings.ai_index_chat`, `settings.chat_ingest_enabled`

---

## 4. Quy tắc nghiệp vụ chính

**Phân quyền** (kiểm tra trong transaction của core): OWNER/ADMIN thêm/xoá thành viên và gán việc; chỉ OWNER xoá nhóm hoặc chuyển quyền; MEMBER nhận việc chưa gán và chuyển việc của mình; nhóm luôn có ít nhất một OWNER.

**Đa assignee**: gán idempotent; nhận việc dùng `SELECT ... FOR UPDATE` và đếm chỗ (`max_assignees`), hết chỗ trả 409; chuyển việc `DIRECT` hoặc `REQUIRE_ACCEPT` (mặc định `DIRECT`, cấu hình theo nhóm); hoàn thành `ANY` hoặc `ALL`. Xoá thành viên là một transaction: gỡ khỏi mọi task, task hết người về pool, task `ALL` mà người còn lại đã xong thì tự DONE, huỷ transfer đang chờ.

**State machine**: TODO → IN_PROGRESS → IN_REVIEW (tuỳ chọn) → DONE; có BLOCKED và CANCELLED; reopen do admin hoặc assignee.

---

## 5. Lộ trình và kế hoạch chi tiết theo phase

Đội giả định 5 người. Ký hiệu vai trò: **BE1** (core/identity), **BE2** (chat/realtime), **BE3** (Google sync), **FE** (web app), **DevOps/QA** (hạ tầng, test, CI). Ước lượng là thời gian lịch, có chạy song song.

### Tổng quan

| Phase | Nội dung | Thời gian | Phụ thuộc |
|-------|----------|-----------|-----------|
| 0 | Nền tảng monorepo, hạ tầng, khung service | ~1 tuần | – |
| 1 | identity + core + web app tối thiểu | 3 tuần | 0 |
| 1.5 | chat-service realtime | 2 tuần | 1 (một phần) |
| 1.6 | File: upload chia phần, quét virus, thumbnail | 2 tuần | 1.5 |
| 1.7 | Reaction, mention, tìm kiếm, web push | 1 tuần | 1.5 |
| 2 | Sync framework + Google Tasks một chiều | 2 tuần | 1 |
| 2.5 | Đồng bộ ngược theo trường, poll, delta sync | 2 tuần | 2 |
| 3 | Spike Chat + Gmail cá nhân, bot HTTP, email fallback | 2 tuần | 1 |
| 4 | Sheets (ghi + push đọc ngược) | 1–2 tuần | 2 |
| 5 | Củng cố: observability, DLQ replay, load test | 2 tuần | các phase trên |
| 6a | AI chỉ đọc + link | 2 tuần | 1 |
| 6b | AI hành động có xác nhận (**tạm hoãn**, chưa làm) | 2 tuần | 6a |
| 6c | Tìm ngữ nghĩa (indexer, pgvector) | 2 tuần | 1.6, 6a |
| 6d | AI vận hành cho admin nền tảng (chỉ đọc) | 1 tuần | 5, 6a |
| 6e | AI trên Google Chat, thông báo chủ động | 1 tuần | 3, 6a |
| 3.5 | Bridge Google Chat hai chiều (tuỳ chọn) | 3 tuần | 3, 1.5 |

### Gợi ý chạy song song
- Tuần 1: Phase 0 (cả đội).
- Tuần 2–4: BE1 + FE làm Phase 1; BE2 khởi động 1.5 khi có identity + group cơ bản; BE3 dựng khung sync (Phase 2) song song; DevOps/QA làm CI, test tích hợp.
- Tuần 5–8: BE2 làm 1.5→1.6→1.7; BE3 làm 2→2.5; BE1 làm Phase 3 rồi 6a.
- Tuần 9 trở đi: Phase 4, 6b/6c, sau đó 5 (củng cố), 6d/6e; 3.5 chỉ khi thực sự cần.

---

### Phase 0 – Nền tảng (~1 tuần)

**Đầu việc**
- [ ] Monorepo pnpm + Turborepo, ESLint/Prettier/tsconfig chung, commit hook.
- [ ] `docker-compose`: Kafka (KRaft), Postgres, Redis, MinIO, ClamAV (dự phòng).
- [ ] `packages/contracts`: schema Zod cho envelope và event; sinh type dùng chung.
- [ ] `packages/kafka-client`: producer/consumer, retry, DLQ, header correlation-id.
- [ ] `packages/outbox`: bảng outbox + relay + `processed_events`.
- [ ] `packages/storage`: interface `StorageProvider` + bản MinIO.
- [ ] `packages/common`: logger pino, config, error model, health check.
- [ ] CI: lint, typecheck, test, build, Testcontainers.
- [ ] Hai service mẫu chạy "hello event" end-to-end (outbox → Kafka → consumer idempotent).
- [ ] ADR đầu tiên: quy ước event, versioning, đặt tên topic.

**Nghiệm thu**: `docker compose up` + một lệnh chạy được demo; CI xanh; event trùng không xử lý hai lần; kill consumer giữa chừng không mất event.

---

### Phase 1 – identity + core + web tối thiểu (3 tuần)

**identity-service (BE1)**
- [ ] Google OAuth2 + PKCE, lưu `google_sub`, `account_type` (Workspace/cá nhân).
- [ ] JWT 10–15 phút, refresh token xoay vòng; refresh token Google mã hoá AES-256-GCM (khoá từ KMS/Vault).
- [ ] Phát `UserLoggedIn`, `UserGoogleRevoked`.
- [ ] Chuyển app OAuth sang "In production" sớm (tránh token hết hạn 7 ngày ở chế độ Testing).

**core-service (BE1)**
- [ ] Group, member, invitation, phân quyền theo mục 4.
- [ ] Task, đa assignee, claim (khoá hàng), transfer, completion mode, state machine, mã ngắn `GRP-123`.
- [ ] `task_events` append-only, audit, outbox phát `task.events`/`group.events`.
- [ ] Xoá thành viên = một transaction (mục 4).
- [ ] Endpoint đọc cho AI sau này: tìm task, thống kê khối lượng.

**api-gateway + web app (FE, DevOps)**
- [ ] Gateway: JWT, rate limit, correlation-id, routing.
- [ ] Web: đăng nhập, danh sách nhóm, bảng task, chi tiết task, gán/nhận/chuyển.
- [ ] Test tích hợp phân quyền và cạnh tranh nhận việc.

**Nghiệm thu**: 20 request nhận việc đồng thời cho task 1 chỗ → đúng 1 thành công, 19 trả 409; xoá thành viên đúng mọi hệ quả; mọi thay đổi có dòng trong `task_events`.

---

### Phase 1.5 – chat-service realtime (2 tuần, BE2 + FE)
- [ ] Conversation `GROUP`, `TASK_THREAD` (tự tạo khi tạo task), `DM`; membership đồng bộ theo `group.events`.
- [ ] Ghi tin: một transaction cấp `seq` + message + outbox; ack kèm `seq`.
- [ ] Socket.IO + Redis adapter; xác thực JWT, làm mới token qua socket.
- [ ] Bù tin: `GET /conversations/:id/messages?after_seq=`; reconnect gửi `last_seq`.
- [ ] `client_msg_id` chống trùng; hàng đợi gửi offline ở client.
- [ ] Typing, presence (chỉ Redis); trạng thái đã gửi/đã đọc theo `last_read_seq`; sửa/xoá mềm.
- [ ] Task update đẩy qua cùng WebSocket (không SSE riêng).
- [ ] Phân vùng bảng `messages` theo tháng; phân trang theo con trỏ.

**Nghiệm thu**: mất mạng 30 giây rồi kết nối lại không mất/không trùng tin; hai node chat-service vẫn fan-out đúng; độ trễ gửi→nhận p95 trong cùng vùng < 300 ms (mục tiêu, cần đo); người bị xoá khỏi nhóm mất truy cập ngay.

---

### Phase 1.6 – File (2 tuần, BE2 + FE)
- [ ] `POST /files/init` (kiểm tra quyền + quota) → multipart upload ID + URL ký từng phần.
- [ ] Client tải song song, retry từng phần, tiếp tục sau khi mất mạng; `POST /files/:id/complete`.
- [ ] Media worker qua `media.events`: ClamAV → nhận diện loại thật theo nội dung → thumbnail/preview (ảnh, PDF trang đầu) → `READY`.
- [ ] Khử trùng lặp theo `sha256` trong cùng nhóm.
- [ ] Tải về: kiểm tra thành viên → redirect tới URL ký hạn ngắn; `Content-Disposition: attachment` (trừ ảnh/PDF đã kiểm soát); phục vụ từ domain riêng.
- [ ] Dọn file mồ côi sau 24 giờ; quota theo nhóm (cấu hình, cho phép `null` = không giới hạn); cảnh báo dung lượng/chi phí.
- [ ] Trần mỗi file là cấu hình (gợi ý mặc định vài GB).

**Nghiệm thu**: upload file 2 GB thành công, ngắt mạng giữa chừng vẫn tiếp tục được; file có mẫu virus EICAR bị chặn, không cấp link; file HTML/SVG không chạy script trên domain app; thành viên bị xoá không tải được file.

---

### Phase 1.7 – Reaction, mention, tìm kiếm, web push (1 tuần)
- [ ] Reaction, mention (thông báo), reply/thread trong hội thoại.
- [ ] Tìm kiếm full-text Postgres (unaccent cho tiếng Việt), lọc theo nhóm/task.
- [ ] Web push cho người offline; email digest qua messaging-service.

**Nghiệm thu**: tìm "hop dong" ra tin chứa "hợp đồng"; người offline nhận push trong vài giây.

---

### Phase 2 – Sync framework + Google Tasks một chiều (2 tuần, BE3)
- [ ] `sync_jobs`: gom, debounce 5–30 giây, khử trùng lặp, bỏ qua nếu `content_hash` không đổi, chỉ PATCH trường đổi.
- [ ] `google-limiter` (in-memory, giữ interface để đổi sang Redis), cache access token.
- [ ] Mỗi assignee có bản riêng trong tasklist riêng của app; chống tạo trùng bằng trạng thái `CREATING` + marker `[app:taskId]` trong notes.
- [ ] Phân loại lỗi: quota → retry backoff; `invalid_grant` → `AUTH_REQUIRED`; dữ liệu sai → DLQ.
- [ ] Reconcile định kỳ.

**Nghiệm thu**: tạo/sửa/hoàn thành task trong app xuất hiện đúng trên Google Tasks; gửi lại cùng job không tạo trùng; thu hồi quyền Google → link chuyển `AUTH_REQUIRED`, app vẫn chạy.

---

### Phase 2.5 – Đồng bộ ngược + delta sync (2 tuần, BE3)
- [ ] Poll theo sự kiện: đăng nhập, tab hiển thị lại, trước khi ghi đè, bấm làm mới; poll nền giãn dần 5→10→20→60 phút. Mỗi lượt là `tasks.list` với `updatedMin`, `showCompleted/showHidden/showDeleted`, có `fields`. Không poll user không có task mở.
- [ ] Merge ba bên theo `base_snapshot` và `field_hashes`:
  - Hoàn thành (theo assignee): hai chiều, timestamp mới hơn thắng.
  - Tiêu đề/hạn (chỉ ngày): hai chiều, chỉ creator/admin được sửa từ Google; nội bộ thắng khi xung đột.
  - Ghi chú: vùng cá nhân của assignee tách khỏi vùng app quản lý; nội bộ thắng ở vùng app.
  - Xoá trên Google: link thành `DETACHED`, không xoá nội bộ. Task lạ (không marker): bỏ qua.
- [ ] Chống echo bằng etag + hash từng trường; thay đổi từ Google đi qua `google.signals` kèm `changedFields`, core kiểm tra quyền rồi áp dụng.
- [ ] Delta sync khi đăng nhập: trả JWT ngay, phát `UserLoggedIn`; nền chạy kiểm tra cooldown/token → đẩy task thiếu/lệch → kéo thay đổi bằng `updatedMin` trừ overlap vài chục giây → đặt cursor = thời điểm bắt đầu pull → digest thông báo bị lỡ.
- [ ] Lần đầu liên kết chỉ backfill task đang mở, chia lô nhỏ; nút "đồng bộ đầy đủ".

**Nghiệm thu**: sửa trên cả hai phía cùng lúc cho kết quả đúng theo bảng xung đột; không vòng lặp echo (đo số job sinh ra sau một thay đổi); người dùng mới liên kết 500 task đang mở không vượt quota.

---

### Phase 3 – Spike Chat + bot (2 tuần)

**Spike (2–3 ngày) – phải trả lời trước khi cam kết tính năng liên quan Google Chat**

| # | Câu hỏi | Ảnh hưởng |
|---|---------|-----------|
| 1 | Chat app / Events API có dùng được với Gmail cá nhân không? | Nếu không: người dùng cá nhân chỉ có app + email |
| 2 | Auth bằng app (`chat.app.*`) có khả thi, có cần admin Workspace duyệt? | Quyết định auth user hay auth app |
| 3 | Tải file đính kèm từ Chat bằng app auth? | Thiết kế bridge file |
| 4 | Mức phân loại scope đọc tin nhắn, thời gian duyệt OAuth | Lịch phát hành |
| 5 | Hạn mức Chat API và Workspace Events API | Thiết kế limiter |
| 6 | Thời gian phản hồi tối đa Google yêu cầu với Chat app endpoint | Thiết kế endpoint đồng bộ/bất đồng bộ |
| 7 | Tasks API có batch endpoint / push không | Tối ưu quota |

**Đầu việc triển khai**
- [ ] Chat app dùng HTTP endpoint (không dùng incoming webhook): nhận nút bấm, slash command, mention, nhắn riêng.
- [ ] Xác minh JWT Google cho mọi request; chống trùng sự kiện; trả card mới ngay trong HTTP response.
- [ ] Thông báo = cập nhật card cũ thay vì gửi tin mới; digest.
- [ ] Email fallback cho người dùng không dùng được Chat.
- [ ] Hoàn thành task từ card (`completed_source = CHAT`).

**Nghiệm thu**: bấm nút trên card hoàn thành đúng task; sự kiện gửi lại không xử lý hai lần; ghi lại kết quả spike vào `docs/` thành ADR.

---

### Phase 4 – Google Sheets (1–2 tuần, BE3)
- [ ] Sheet do owner nhóm sở hữu (scope `drive.file`), chia sẻ qua Drive.
- [ ] Ghi: gom theo nhóm 30–60 giây, ghi cả vùng một lời gọi, idempotent.
- [ ] Đọc ngược: push từ Drive (`drive_watch_channels`, xác minh token kênh, gia hạn kênh), debounce, `batchGet`, so hash từng dòng.
- [ ] Chỉ cột chọn trước được sửa ngược; cột còn lại đặt protected range.
- [ ] Giữ trong hạn mức Sheets (300 req/phút/project, 60 req/phút/user – đã đối chiếu tài liệu).

**Nghiệm thu**: 100 thay đổi trong 1 phút chỉ tạo vài lời gọi ghi; sửa cột được phép trên Sheet phản ánh về app; sửa cột bị bảo vệ không đi vào hệ thống.

---

### Phase 5 – Củng cố (2 tuần, cả đội)
- [ ] Observability: pino, correlation-id qua REST và Kafka header, OpenTelemetry; dashboard: lượt gọi Google theo API, tỷ lệ 429, độ sâu `sync_jobs`, consumer lag, DLQ, số socket, độ trễ gửi tin, dung lượng lưu trữ.
- [ ] Cảnh báo khi quota Google vượt 70–80%.
- [ ] Công cụ replay DLQ.
- [ ] Load test với Google mock: đo số user tối đa theo quota Tasks (mặc định 50.000 truy vấn/ngày; ước tính sơ bộ đủ cho 500–800 user, **phải đo thật**).
- [ ] Hardening: rà soát bảo mật, pen-test cơ bản, backup/restore, runbook sự cố.

**Nghiệm thu**: load test đạt mục tiêu đã đặt; diễn tập mất một broker/node không mất dữ liệu; runbook được thử bởi người ngoài nhóm phát triển.

---

### Phase 6 – ai-service

**Nguyên tắc**: mô hình chỉ gọi tool (REST tới service sở hữu dữ liệu bằng token nhân danh, phạm vi hẹp `via=ai`); trả về *tham chiếu thực thể* (loại + ID), server kiểm tra rồi mới dựng link; mọi hành động ghi tạo `pending_action` và cần người dùng bấm xác nhận.

**Mô hình**: Claude Sonnet 5 cho vòng lặp chính, Claude Haiku 4.5 cho việc nhẹ; bọc sau `LLMProvider`; dùng tool use, streaming, prompt caching cho phần cố định. **[CHƯA XÁC MINH]** kiểm tra model string, giới hạn, giá và chính sách lưu giữ dữ liệu hiện hành trong tài liệu Anthropic.

#### 6a – Chỉ đọc + link (2 tuần) – PHẠM VI HIỆN TẠI
> **Phạm vi:** người dùng nhắn câu hỏi, AI trả lời bằng thông tin lấy từ hệ thống và kèm đường dẫn mở thẳng tới task, nhóm, hội thoại, file hoặc báo cáo. Chỉ đọc, luôn theo đúng quyền của người hỏi. Không tạo, sửa, giao, xoá gì.
> **Ngoài 6a:** tìm nội dung tin nhắn/file theo ngữ nghĩa (6c), chế độ admin nền tảng (6d), Google Chat (6e).

- [ ] Orchestrator (vòng lặp mô hình → tool → mô hình), tối đa 8 vòng/câu, timeout.
- [ ] Tool đọc: `list_my_tasks`, `search_tasks`, `get_task`, `get_group`, `list_members`, `workload_summary`, `get_report_link`, `sync_status`.
- [ ] Link resolver: bảng mẫu URL trên server, gọi lại service gốc để xác nhận tồn tại + quyền, không qua được thì bỏ khỏi câu trả lời.

| Thực thể | Link |
|----------|------|
| Task | `/groups/{groupId}/tasks/{code}` |
| Nhóm / hội thoại / tin nhắn | `/groups/{id}`, `/conversations/{id}?seq={n}` |
| File | Trang xem file trong app (không nhúng link tải trực tiếp) |
| Sheet / Chat space | Link Google nếu đã lưu `sheet_id` / `chat_space_id` |
| Google Tasks | Ưu tiên link về app **[CHƯA XÁC MINH]** link web ổn định |

- [ ] SSE streaming qua gateway; lưu phiên; giao diện khung chat AI và thẻ link.
- [ ] `ai_audit`, `ai_usage`; giới hạn theo user: câu hỏi/phút, ngân sách token/ngày.
- [ ] Token nhân danh từ identity; gắn `actor.via = "ai-assistant"`.

**Nghiệm thu**: "Việc nào của tôi sắp trễ hạn tuần này? Cho mình link" trả đúng danh sách + link mở được; người A hỏi dữ liệu nhóm B không thấy gì; 100% link trả ra hợp lệ và đúng quyền.

#### 6b – Hành động có xác nhận (2 tuần) – TẠM HOÃN
> **Quyết định hiện tại:** giai đoạn đầu AI chỉ dừng ở 6a (hỏi đáp, đưa thông tin và đường dẫn). Không xây công cụ ghi/xoá nào. Nội dung dưới đây giữ lại làm thiết kế tham khảo, chỉ mở lại khi có quyết định mới.

- [ ] Tool ghi: `create_task`, `assign_task`, `claim_task`, `transfer_task`, `change_status`, `post_message` → tạo `ai_pending_actions` (không thực thi).
- [ ] Thẻ xác nhận hiển thị tham số + hậu quả; thực thi qua core với idempotency key và `confirmation_id`; hết hạn tự động.
- [ ] Core/chat hỗ trợ `confirmation_id`, từ chối thao tác nhạy cảm khi thiếu.
- [ ] Chưa mở `add_member`, `remove_member`, `change_role` cho tới khi bộ test phân quyền + injection chạy ổn (mở sau, kèm hiển thị hậu quả).
- [ ] Cấm hẳn: xoá nhóm, xoá hàng loạt, xem token, đổi cấu hình bảo mật.

**Nghiệm thu**: MEMBER bảo AI giao việc cho người khác vẫn bị core từ chối; bấm xác nhận hai lần chỉ thực thi một lần; hành động của AI hiện trong audit với `actor.via`.

#### 6c – Tìm ngữ nghĩa (2 tuần)
- [ ] Indexer (consumer Kafka riêng): `task.events`, `chat.events`, `media.events` (+ `FileTextExtracted` từ media worker: PDF, docx, xlsx; giới hạn dung lượng trích và số trang; OCR để sau).
- [ ] Cắt đoạn, embedding, lưu pgvector cùng metadata; kết hợp full-text + vector.
- [ ] So sánh model embedding trên dữ liệu tiếng Việt thật (Voyage AI đa ngôn ngữ vs model tự chạy). **[CHƯA XÁC MINH]** chất lượng, cần benchmark.
- [ ] Phân quyền truy hồi: lấy danh sách nhóm hiện tại của người hỏi từ core (không cache cũ), lọc theo `group_id`, xác minh lại mỗi kết quả qua service gốc.
- [ ] Không index DM; xoá chỉ mục khi xoá nhóm; cập nhật khi tin sửa/xoá.
- [ ] Tool: `search_messages`, `search_files`, `search_task_text`; bọc kết quả là *dữ liệu*, không phải chỉ thị.

**Nghiệm thu**: bộ câu hỏi tiếng Việt đạt ngưỡng recall đã đặt; người bị xoá khỏi nhóm không tìm thấy nội dung nhóm ngay lập tức; tin bị xoá biến khỏi kết quả trong vài giây.

#### 6d – Vận hành cho admin nền tảng (1 tuần)
- [ ] Tool chỉ đọc: `service_health`, `consumer_lag`, `dlq_summary`, `google_quota_usage`, `sync_backlog`; chỉ role admin nền tảng.
- [ ] Hành động vận hành (ví dụ phát lại DLQ) để sau, luôn cần admin nền tảng xác nhận.

#### 6e – Google Chat + chủ động (1 tuần)
- [ ] `@bot hỏi ...` qua messaging → ai-service; trả card kèm link app; không stream (gửi "đang xử lý" rồi cập nhật card).
- [ ] Job theo lịch: tóm tắt tuần, nhắc việc trễ hạn, gợi ý cân bằng khối lượng (không tự hành động).

---

### Phase 3.5 – Bridge Google Chat hai chiều (tuỳ chọn, 3 tuần)
Chỉ làm nếu spike Phase 3 khả thi và có nhu cầu thật.
- [ ] Workspace Events API + Pub/Sub: streaming pull, verify subscription/space, bỏ tin do bot gửi, dedupe theo `message.name + updateTime`, upsert idempotent, ACK Pub/Sub **sau khi** Kafka xác nhận; dead-letter cho subscription.
- [ ] Payload đầy đủ (subscription tối đa 4 giờ) hay chỉ tên resource (tối đa 7 ngày): quyết định dựa trên lưu lượng thực (điểm hoà vốn ~8 tin/ngày/space).
- [ ] `watch-manager`: gia hạn sớm khi còn < 1/3 thời hạn, timer nội bộ là chính, lifecycle event là dự phòng; retry backoff; `reactivate` khi `SUSPENDED`; chuyển authorizer khi người ủy quyền mất khả năng; trạng thái `DEGRADED` nếu không còn ai.
- [ ] Bù gap bằng `spaces.messages.list` lọc theo thời gian từ `last_event_time` **[CHƯA XÁC MINH]** hỗ trợ lọc; mặc định không backfill lịch sử.
- [ ] Ghi vào `messages` của chat-service với `origin = GOOGLE_CHAT`; chống vòng lặp bằng `origin` + `google_message_map`.
- [ ] App → Chat: consume `chat.events`, gửi bằng bot, ghi rõ người gửi; file ≤ 200 MB và người gửi đã liên kết Google thì tải lên bằng token của họ, ngược lại gửi thẻ link về file trong app.
- [ ] Riêng tư: OWNER bật chủ động (`chat_ingest_enabled`), bot thông báo công khai, chỉ space đã liên kết, không dùng `spaces/-`, không xử lý DM, lưu tối thiểu có TTL (mặc định 30 ngày), mã hoá, audit truy cập.

---

## 6. Bảo mật, riêng tư, tuân thủ

### 6.1 Chung
- JWT ngắn hạn, refresh xoay vòng; Google token mã hoá, chỉ identity giữ.
- Scope Google tối thiểu, xin bổ sung dần; chuẩn bị quy trình xác minh OAuth cho scope nhạy cảm.
- Thu hồi quyền Google → dừng sync, `AUTH_REQUIRED`.
- Xác minh JWT của Google cho request từ Chat và token của kênh push Drive.

### 6.2 File
Quét virus trước khi cho tải; nhận diện loại theo nội dung; phục vụ từ domain riêng; link ký hạn ngắn, kiểm tra quyền mỗi lần cấp; markdown lọc an toàn; link preview chống SSRF; rate limit theo user (chống spam, không phải giới hạn dung lượng).

### 6.3 AI

| Rủi ro | Biện pháp |
|--------|-----------|
| Prompt injection | Nội dung truy hồi gắn nhãn là dữ liệu; mọi ghi cần xác nhận trên giao diện; hiển thị rõ tham số |
| Lộ dữ liệu giữa nhóm | Lọc theo nhóm hiện tại, xác minh lại qua service gốc, test phân quyền tự động |
| AI làm quá quyền | Token nhân danh phạm vi hẹp; service từ chối thao tác nhạy cảm thiếu `confirmation_id` |
| Lộ bí mật | Không đưa token/khoá vào ngữ cảnh; che thông tin nhạy cảm trong log |
| Gửi nội dung ra nhà cung cấp LLM | OWNER bật theo nhóm, thông báo trong nhóm, loại DM; đọc kỹ chính sách lưu giữ của nhà cung cấp **[CHƯA XÁC MINH]** |
| Chi phí | Giới hạn câu hỏi/phút, token/ngày, số vòng tool, timeout |
| Không truy vết | `ai_audit` + `actor.via` trong event của core |

---

## 7. Chiến lược kiểm thử

| Loại | Nội dung |
|------|----------|
| Unit + tích hợp | Vitest + Testcontainers (Postgres, Kafka, Redis, MinIO) |
| Contract | Kiểm tra schema event giữa producer và consumer trong CI |
| Đồng thời | Nhận việc cạnh tranh, cấp `seq`, gửi trùng `client_msg_id` |
| Chaos | Kill consumer/broker, Redis mất tin, Google trả 429/5xx |
| Google mock | Load test sync mà không tốn quota thật |
| Phân quyền | Ma trận vai trò × hành động; A xem dữ liệu nhóm B |
| AI – chọn tool | Bộ câu hỏi tiếng Việt chuẩn kèm tool/tham số đúng |
| AI – injection | Tin nhắn/file chứa lệnh độc hại: không thực thi, không tiết lộ |
| AI – link | Mọi link mở được và đúng quyền |
| Bảo mật file | Mẫu EICAR, HTML/SVG độc, file đổi đuôi |

---

## 8. Ước lượng tải và chi phí (thô, cần đo thật)

- **Google Tasks**: 50.000 truy vấn/ngày mặc định; giả định mỗi user mở app ~3 giờ/ngày → đủ ~500–800 user. Vượt thì xin tăng quota hoặc giảm poll nền.
- **Sheets**: 300 req/phút/project; 60 req/phút/user.
- **Chat file**: `media.upload` tối đa 200 MB, cần auth user, chặn một số loại file.
- **WebSocket**: vài trăm user cần 1–2 node **[chưa đo]**.
- **Lưu trữ file**: ví dụ 100 người × 5 file × 5 MB/ngày ≈ 2,5 GB/ngày ≈ 900 GB/năm → cần quota, khử trùng lặp, lớp lưu trữ rẻ, cảnh báo chi phí.
- **AI**: ví dụ 200 user × 20 câu/ngày = 4.000 câu, ~4 lượt gọi/câu, 5–8 nghìn token đầu vào/lượt → vài chục đến ~100 triệu token đầu vào/ngày trước cache; giảm mạnh nhờ prompt caching, cần đo.
- **Pub/Sub** (nếu làm bridge): cần project Google Cloud có thanh toán.

---

## 9. Rủi ro và giảm thiểu

| Rủi ro | Giảm thiểu |
|--------|-----------|
| Chat không dùng được với Gmail cá nhân | Chat trong app là chính; Google Chat là kênh phụ; email dự phòng |
| Refresh token hết hạn 7 ngày ở chế độ Testing | Chuyển "In production" sớm |
| Vượt quota Tasks | Poll theo sự kiện, ưu tiên lệnh ghi, xin tăng quota |
| Giằng co khi user sửa trên Google | Merge ba bên, phân quyền theo trường, xoá → `DETACHED` |
| Event trùng/sai thứ tự | Key theo aggregate, `aggregateVersion`, idempotency, `seq` |
| Chi phí lưu trữ/băng thông file | Quota nhóm, khử trùng lặp, lớp lưu trữ rẻ, cảnh báo |
| Prompt injection / lộ dữ liệu qua AI | Xác nhận hành động, lọc quyền khi truy hồi, bộ test riêng |
| Chi phí LLM vượt dự kiến | Giới hạn theo user, cache prompt, model nhỏ cho việc nhẹ |
| Độ phức tạp với đội nhỏ | Modular monolith trong core; tách chat/Google/AI đúng chỗ; hoãn bridge |
| Scope Google nhạy cảm bị duyệt chậm | Bắt đầu quy trình xác minh sớm, không để nằm trên đường găng |

---

## 10. Điều đã xác minh và chưa xác minh

**Đã đối chiếu tài liệu (theo các phiên trước)**
- Tasks API: mặc định 50.000 truy vấn/ngày.
- Sheets API: 300 req/phút/project, 60 req/phút/user; mỗi batch tính một request.
- Chat `media.upload`: tối đa 200 MB, cần auth user, chặn một số loại file.
- Events API: payload đầy đủ → subscription tối đa 4 giờ; chỉ tên resource → tối đa 7 ngày.
- Incoming webhook của Chat chỉ gửi một chiều.

**Chưa xác minh** (xem spike Phase 3): Gmail cá nhân với Chat/Events API; auth `chat.app.*` và việc admin duyệt; tải file đính kèm bằng app auth; phân loại scope đọc tin nhắn; hạn mức Chat và Events API; batch endpoint và push của Tasks API; thời gian phản hồi tối đa của Chat endpoint; link web ổn định của Google Tasks; model string/giá/chính sách dữ liệu của nhà cung cấp LLM; chất lượng embedding tiếng Việt.

---

## 11. Các quyết định đã chốt và còn mở

**Đã chốt**
- Chat trong app chạy độc lập; bridge Google Chat là tính năng tuỳ chọn ở Phase 3.5.
- Chỉ OAuth theo từng người, không domain-wide delegation.
- Thêm `chat-service` (WebSocket) và `ai-service`; tổng 7 service.
- Bình luận task = `TASK_THREAD` trong chat-service.
- **AI giai đoạn đầu chỉ ở mức 6a:** người dùng hỏi gì, hệ thống trả lời kèm thông tin và đường dẫn tới thực thể. AI không thao tác thay người dùng (6b tạm hoãn). Chưa có công cụ ghi/xoá, nên chưa cần thẻ xác nhận hành động.

**Còn mở – cần bạn quyết**
1. Kho lưu trữ production: GCS, S3 hay Cloudflare R2.
2. Trần dung lượng mỗi file và quota mặc định mỗi nhóm.
3. Nhà cung cấp embedding (Voyage AI hay model tự chạy), chỉ cần khi làm 6c.
4. Có làm bridge Google Chat (3.5) hay không, tuỳ kết quả spike.
5. Khi nào làm 6c (tìm ngữ nghĩa trong tin nhắn/file). 6a chỉ truy vấn có cấu trúc (task, nhóm, thành viên, báo cáo); câu hỏi kiểu "hôm trước mọi người bàn gì về hợp đồng X" cần 6c.

---

## 12. Bước tiếp theo
1. Chốt các quyết định mở ở mục 11.
2. Bắt đầu Phase 0 (monorepo, docker-compose, các package nền, "hello event").
3. Lên lịch spike Phase 3 (2–3 ngày) sớm, chạy song song với Phase 1 để không chặn các quyết định về Google Chat.
