# Kế hoạch triển khai – v2.5 (Design Spec)

**Date:** 2026-09-28  
**Status:** Draft — awaiting user review  
**Supersedes:** `ke-hoach-trien-khai-v2.4.md` (nguồn chuẩn mới cho kiến trúc & lộ trình)  
**Approach:** Giữ tầm nhìn hệ thống lớn (7 service, Kafka, sync Google, AI) từ đầu; sửa mâu thuẫn / lỗ hổng của v2.4; không cắt service.

> Các mục đánh dấu **[CHƯA XÁC MINH]** cần spike hoặc đọc lại tài liệu chính thức của Google/Anthropic trước khi cam kết.  
> Chi tiết phase checklist không đổi so với v2.4 được **giữ nguyên ý**; dưới đây ghi phần đã chỉnh và phần bổ sung bắt buộc.

---

## 1. Mục tiêu và phạm vi

### 1.1 Tầm nhìn (dài hạn)
1. Quản lý nhóm, task đa assignee, nhận việc, chuyển việc, audit.
2. Chat trong app (nhóm, bình luận task, DM), gửi file, realtime; có trần/quota mặc định, có thể mở `null` = không giới hạn theo nhóm.
3. Đồng bộ Google Tasks (hai chiều theo trường), Google Sheets (báo cáo), Google Chat (bot; bridge hai chiều tuỳ chọn).
4. Trợ lý AI: hỏi đáp theo quyền, trả link thực thể; **về sau** thao tác thay người dùng có xác nhận (Phase 6b).
5. Chạy được cho Google Workspace và Gmail cá nhân ở mức API cho phép (spike Phase 3).

### 1.2 Phạm vi ship hiện tại (không mâu thuẫn tầm nhìn)
- **Client:** Flutter (iOS / Android / Web cùng codebase) — không lấy “web app FE riêng” làm mặc định.
- **Auth:** Google OAuth (PKCE) **và** email/password + OTP song song từ Phase 1.
- **AI hiện tại:** chỉ **6a** (đọc + link). Phase **6b tạm hoãn**.
- **Bridge Google Chat (3.5):** ngoài phạm vi bắt buộc; sau spike + nhu cầu thật.
- Không: domain-wide delegation; AI OCR/video; AI thêm/xoá thành viên; tool xoá hàng loạt (không bao giờ).

### 1.3 Nguyên tắc thiết kế
1. DB nội bộ là nguồn chuẩn. Google Tasks/Sheets/Chat chỉ là bản chiếu.
2. Tách 7 service **sẵn** vì failure domain (Google quota, realtime, AI cost) và để lần sau chủ yếu phát triển tính năng — không chờ scale mới tách.
3. Kafka cho thay đổi trạng thái giữa service; realtime client qua Redis + WebSocket.
4. Không gọi Google từ luồng nghiệp vụ; mọi lời gọi qua `sync_jobs` (gom, debounce, khử trùng).
5. Push khi Google có push; poll theo sự kiện, không theo đồng hồ cứng.
6. Core + chat độc lập với Google; Google lỗi thì app vẫn dùng được.
7. OAuth theo từng người (+ credential local cho email/password).
8. AI nhân danh user; model không chạm DB; link do server sinh; nội dung chat/file là dữ liệu không tin cậy.
9. Cache chỉ là bản đọc; hết RAM/mất mạng không được làm sai dữ liệu chuẩn hay spam invalidate.

### 1.4 Mốc Internal Alpha
**Definition of Done:** Phase **1 + 1.5** hoàn thành (auth 2 kiểu, core nhóm/task, chat realtime trên Flutter).  
Google sync, Sheets, AI, file đầy đủ (multipart 2GB + ClamAV) **không chặn** mốc này; làm song song hoặc ngay sau.  
Upload file tối thiểu (một shot hoặc init+put đơn giản) được phép trong alpha; Phase **1.6** vẫn là chuẩn đầy đủ.

---

## 2. Kiến trúc tổng thể

### 2.1 Service (7) — giữ như v2.4

| # | Service | Trách nhiệm |
|---|---------|-------------|
| 1 | `api-gateway` | JWT, rate limit, correlation-id, định tuyến, SSE `/ai/*` |
| 2 | `identity-service` | Google OAuth2 + PKCE, email/password + OTP, JWT, token Google mã hoá, `google_sub`, `account_type`, `UserLoggedIn`, token nhân danh AI |
| 3 | `core-service` | Group, task, đa assignee, transfer, audit, outbox |
| 4 | `chat-service` | Hội thoại, tin nhắn, file, WebSocket (Socket.IO + Redis), media worker |
| 5 | `google-sync-service` | Planner, `sync_jobs`, Tasks/Sheets, poller, delta sync, limiter, webhook Drive |
| 6 | `messaging-service` | Chat app HTTP (bot), email, thông báo, digest; sau này bridge Events API |
| 7 | `ai-service` | Orchestrator LLM, tools, link resolver, retrieval, guardrails, audit, chi phí |

### 2.2 Sơ đồ luồng (đã chỉnh client)

```
Flutter (iOS/Android/Web) ──REST──► api-gateway ──► identity | core | chat | ai
     │                                      (sync, messaging: nội bộ)
     ├──WebSocket──► chat-service ◄──► Redis (fan-out, presence, typing, **read-cache**)
     └──SSE──────► api-gateway ──► ai-service

core / chat ──outbox──► KAFKA ──► google-sync | messaging | chat media | ai indexer
Google Chat ──HTTP──► messaging ──REST──► core / ai
Drive push ──► webhook google-sync
```

### 2.3 Kafka, tech stack, monorepo
Giữ quy ước v2.4: một topic / aggregate; `aggregateVersion`; idempotent `processed_events`; Transactional Outbox; envelope `eventId`, `correlationId`, `actor.via` (`user` | `ai-assistant` | `google` | `system`).

Stack: Node.js LTS, Express, TypeScript, Socket.IO + Redis adapter, Postgres, Redis, kafkajs, Zod, StorageProvider (MinIO local → R2/S3/GCS), ClamAV, pgvector, Vitest + Testcontainers, googleapis, pnpm + Turborepo, OpenTelemetry + pino.

**Bổ sung bắt buộc:** OpenAPI (hoặc contract HTTP tương đương) từ Phase 1 để Flutter tích hợp; contract Kafka giữ trong `packages/contracts`.

### 2.4 `google.signals` → core (làm chặt)
- Chỉ `google-sync-service` được đưa signal vào đường này (network policy + service token nội bộ).
- Core áp dụng trong transaction theo bảng merge field-level; ghi `task_events` với `actor.via = google`.
- Từ chối hoặc merge có kiểm soát khi version/etag lệch — không ghi đè im lặng trái quy tắc.

---

## 3. Auth (Phase 1)

### 3.1 Hai phương thức
1. **Google OAuth2 + PKCE** — chính cho sync Google; lưu refresh mã hoá; `account_type` Workspace/cá nhân.
2. **Email/password + OTP** — đăng ký, verify, forgot/reset; hash **Argon2id** (hoặc tương đương); OTP TTL ngắn.

### 3.2 Liên kết tài khoản
- Một user có thể có cả `google_sub` và credential email.
- Google đăng nhập trùng email đã có **không** merge ngầm: bắt buộc bước xác nhận liên kết; audit link/unlink.
- JWT/refresh thống nhất cho mọi phương thức đăng nhập.

### 3.3 Bảo vệ
- Rate limit riêng `/auth/*` (login, OTP, reset) trên gateway; khóa tạm sau N lần sai.
- Chuyển OAuth app sang "In production" sớm (tránh refresh Google 7 ngày ở Testing).

---

## 4. Cache & chịu tải

### 4.1 SLO
| Mốc | Mục tiêu |
|-----|----------|
| Internal Alpha | ~50 user đồng thời trên app |
| GA (hướng tới) | ~500 user đồng thời app; trần Google Tasks tách riêng (~500–800 user theo quota mặc định — **phải đo**) |
| API list task | p95 < 200 ms (cùng vùng) |
| Chat gửi→nhận | p95 < 300 ms (cùng vùng; đã có ở v2.4) |

Load test nhẹ (k6/smoke) từ Phase 1.5; đầy đủ + Google mock ở Phase 5.

### 4.2 Cache Redis — mức B (cache-aside + invalidate theo event)

| Dữ liệu | Chiến lược |
|---------|------------|
| Membership / `group_members` | Key theo `groupId`; **xóa** khi `group.events` |
| Task list theo nhóm | Key theo `groupId` (+ filter hash); **xóa/cập nhật** khi `task.events` |
| Task chi tiết | Key `taskId` + `version`; miss → DB |
| Last-N messages | N = 50–100 tin mới/conversation; cập nhật khi ghi/sửa/xoá mềm; ngoài cửa sổ hoặc miss → Postgres `after_seq` |
| File metadata | Cache row metadata; **URL ký** chỉ TTL ngắn hơn hạn chữ ký |
| Thumbnail / static file domain | CDN hoặc cache HTTP trên domain file riêng |
| Google access token + limiter | In-memory nếu 1 replica `google-sync`; **Redis** khi nhiều replica |
| AI: danh sách nhóm của user | **Không** cache dài (an toàn quyền); TTL rất ngắn chỉ nếu đo được bottleneck |

**Nguồn chuẩn vẫn là DB.** Cache chỉ bản đọc.

### 4.3 Xóa / cập nhật cache (bắt buộc có)

| Sự kiện | Hành vi |
|---------|---------|
| `task.events` / `group.events` | Invalidate key liên quan (idempotent: xóa nhiều lần vẫn an toàn) |
| Tin nhắn mới/sửa/xoá | Cập nhật last-N hoặc invalidate conversation key |
| File READY / đổi metadata | Invalidate metadata; không giữ URL ký lâu |
| User bị xoá khỏi nhóm | Invalidate membership **ngay** (khớp nghiệm thu mất truy cập tức thì) |
| Ops flush | Chỉ admin nền tảng / runbook; auth + audit; **không** expose API flush cho client |

**Cấm:** client tự gọi “xóa cache”; flush-all khi WebSocket/Kafka reconnect; dùng Redis làm nguồn ghi.

Stampede: singleflight / lock ngắn khi miss hàng loạt.

### 4.4 Gắn phase
- Phase 0–1: convention key Redis, tách prefix `rt:` (realtime) vs `cache:` (đọc).
- Phase 1: membership + task list/detail cache.
- Phase 1.5: last-N messages.
- Phase 1.6: file metadata + CDN/domain file.
- Phase 2: Redis limiter khi scale google-sync.
- Phase 5: đo hit rate, tinh chỉnh TTL, diễn tập eviction.

---

## 5. Chống trùng, mất mạng, OOM, chống spam

### 5.1 Chống trùng lặp (giữ v2.4 + bổ sung cache)
- Kafka: `eventId`, `processed_events`, `aggregateVersion`.
- Chat: `client_msg_id`; bù `after_seq` / `last_seq`.
- Sync: debounce job, `content_hash`, `CREATING` + marker `[app:taskId]`.
- Bot/bridge: dedupe sự kiện Chat; `message.name + updateTime` khi làm 3.5.
- File: `sha256` trong nhóm.
- AI 6b (khi mở): `idempotency_key`.
- **Cache invalidate idempotent** (chỉ DELETE key / cập nhật last-N có phiên bản, không flip-flop).

### 5.2 Mất mạng
- Chat/file: hàng đợi offline client, resume upload, reconnect + bù seq (v2.4).
- **Không** flush toàn bộ cache khi reconnect Kafka/WebSocket.
- Consumer bắt lại → chỉ xử lý event chưa `processed`; invalidate theo từng event.
- Flutter: sau reconnect **ưu tiên bù từ API**; cache local chỉ hỗ trợ UX, server là chuẩn.

### 5.3 Hết bộ nhớ (Redis / process)
- Redis: cấu hình `maxmemory` + eviction **`allkeys-lru`** hoặc **`volatile-ttl`** trên key `cache:*` có TTL.
- Tách rõ key realtime (`rt:`) vs cache đọc (`cache:`) — tránh eviction làm sập presence/Socket adapter; nếu một Redis: ưu tiên TTL trên cache đọc, monitor memory riêng.
- Hết RAM cache → **miss + đọc DB**, dữ liệu vẫn đúng; không cascade xóa DB.
- Process Node: giới hạn body size; hàng đợi bền vững nằm DB (outbox / `sync_jobs`), không buffer vô hạn in-memory.

### 5.4 Chống spam
- Gateway rate limit chung + 429 thống nhất; correlation-id.
- `/auth/*`: OTP/login/reset rate limit + khóa tạm.
- Chat: rate limit gửi tin / reaction theo `userId` + `conversationId`; giới hạn kích thước body; throttle khi vượt.
- Upload: rate limit theo user (chống spam, ngoài quota dung lượng).
- AI: câu hỏi/phút, token/ngày, max tool loops, timeout (6a).
- Messaging: digest/gom thông báo; không spam card/email từng event nếu đã có chính sách gom.
- **Cấm** client flush cache; ops flush có audit.

---

## 6. File & quota

- Trần mặc định tạm: **2 GB/file**, **50 GB/nhóm**; OWNER/ADMIN có thể tăng hoặc `null` = không giới hạn.
- Bỏ mọi wording “không đặt giới hạn nhân tạo”.
- Phase 1.6: multipart, ClamAV, MIME theo nội dung, domain riêng, signed URL, orphan cleanup — như v2.4.
- Alpha: upload tối giản được chấp nhận trước khi 1.6 đủ.

Storage: local MinIO; production mặc định tạm **Cloudflare R2** (S3-compatible) — đổi được (mục quyết định mở).

---

## 7. Lộ trình phase (chỉnh trên v2.4)

Thứ tự và ước lượng thời gian **giữ như v2.4**. Thay đổi bắt buộc:

| Thay đổi | Chi tiết |
|----------|----------|
| Vai trò FE | **Flutter** (không còn “web app” mặc định) |
| Phase 1 identity | + email/password, OTP, forgot/reset, liên kết Google↔email |
| Phase 1 client | Màn nhóm/task trên Flutter; nghiệm thu ít nhất Flutter web **hoặc** một mobile + smoke |
| Internal Alpha | DoD = 1 + 1.5; sync/AI không chặn |
| Phase 1 + 1.5 | + cache membership/task; + last-N; + chat rate limit |
| Phase 1.6 | + file metadata cache / CDN; quota mặc định như §6 |
| Phase 3 | **Gate:** không cam kết bridge/Gmail Chat cho đến ADR spike trong `docs/` |
| Phase 6 | Tầm nhìn giữ 6b; **phạm vi hiện tại = 6a**; 6b vẫn tạm hoãn |
| Phase 5 | + đo cache hit, eviction, SLO; runbook flush cache |

Gợi ý song song tuần 1–8 giữ ý v2.4; gắn mốc Alpha khoảng sau khi 1 + 1.5 xong (~tuần 5–6), BE3/AI chạy song song không chặn.

Checklist đầu việc chi tiết từng phase: kế thừa v2.4, áp dụng các chỉnh trên khi triển khai / khi viết implementation plan.

---

## 8. AI (tóm tắt)

- **Hiện tại (6a):** tool chỉ đọc; link resolver trên server; SSE; audit/usage; token nhân danh.
- **6b tạm hoãn:** tool ghi + `ai_pending_actions` + xác nhận UI — giữ thiết kế tham khảo, mở khi có quyết định mới.
- **6c–6e:** như v2.4; embedding **[CHƯA XÁC MINH]** chất lượng tiếng Việt.

---

## 9. Bảo mật, kiểm thử, rủi ro (bổ sung)

### 9.1 Bảo mật
Giữ §6 v2.4 (JWT ngắn, Google token chỉ identity, scope tối thiểu, quét file, chống SSRF preview, AI injection).  
Thêm: Argon2id; OTP/reset một lần dùng; liên kết account có xác nhận; tách domain file; AI 6a không cần `confirmation_id` cho đến 6b.

### 9.2 Kiểm thử — thêm
- Ma trận auth: Google-only, email-only, linked, revoke Google.
- OpenAPI + Kafka contract trong CI.
- Alpha gate checklist (1 + 1.5).
- Cache: sau event, key bị xóa; sau Redis eviction, API vẫn đúng; không flush khi reconnect.
- Spam: vượt rate chat/auth → 429; EICAR/HTML/SVG như v2.4.
- Reconnect Flutter web + mobile: không mất/trùng tin.

### 9.3 Rủi ro — thêm
| Rủi ro | Giảm thiểu |
|--------|------------|
| Đội nhỏ + 7 service | Alpha sớm; health/DLQ tối thiểu từ Phase 0–1, không đợi Phase 5 mới có ops cơ bản |
| Hai kiểu đăng nhập / chiếm email | Luật liên kết + test + audit |
| Flutter lệch web vs mobile | Nghiệm thu reconnect cả hai |
| Cache stale / stampede | Invalidate theo event; singleflight; TTL; DB là chuẩn |
| Redis OOM ảnh hưởng realtime | Prefix tách; monitor; eviction ưu tiên `cache:*` |
| Spam chat/OTP | Rate limit theo §5.4 |
| Quota Google / chi phí AI | Như v2.4; đo thật Phase 5 |

---

## 10. Đã / chưa xác minh & quyết định mở

**Chưa xác minh** (giữ danh sách spike Phase 3 + Anthropic/embedding như v2.4).

**Đã chốt trong v2.5**
- Flutter là client chính.
- Auth: Google + email/OTP song song.
- File: trần/quota mặc định; có thể `null`.
- AI: tầm nhìn có 6b; ship hiện tại chỉ 6a.
- Internal Alpha = Phase 1 + 1.5.
- Cache mức B + invalidate/ops flush + OOM/spam/mất mạng như §4–§5.
- Giữ 7 service / Kafka từ đầu.

**Còn mở (có mặc định tạm)**

| # | Việc | Mặc định tạm |
|---|------|----------------|
| 1 | Storage production | R2 (S3-compatible); MinIO local |
| 2 | Số GB trần/quota | 2 GB/file, 50 GB/nhóm |
| 3 | Embedding 6c | Chọn khi làm 6c (benchmark tiếng Việt) |
| 4 | Bridge 3.5 | Sau spike + nhu cầu |
| 5 | Thời điểm 6c | Sau Alpha + 6a ổn |

---

## 11. Bước tiếp theo
1. User review spec này; chỉnh nếu cần.
2. Viết implementation plan (writing-plans) từ spec đã duyệt.
3. Phase 0 → Phase 1 (+ cache/auth) → 1.5 → Internal Alpha; sync/AI song song theo lịch đội.

---

## 12. Changelog so với v2.4
- Client: Flutter thay web-app mặc định.
- Auth dual + luật liên kết.
- Mục tiêu file/AI/tầm nhìn vs phạm vi hiện tại — hết mâu thuẫn.
- Internal Alpha DoD.
- OpenAPI từ Phase 1; siết `google.signals`.
- Cache mức B, invalidate, ops flush, SLO.
- OOM Redis, không flush khi mất mạng, chống spam chat/auth/cache.
- Gate spike Phase 3; giải thích tách 7 service từ đầu.
- Mặc định tạm storage/quota.
