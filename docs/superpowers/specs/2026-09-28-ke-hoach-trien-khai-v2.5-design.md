# Kế hoạch triển khai – v2.5 (Design Spec)

**Date:** 2026-09-28  
**Status:** Draft — awaiting user review  
**Supersedes:** [v2.4](./2026-09-28-ke-hoach-trien-khai-v2.4.md) (đã lưu trong repo; v2.5 là nguồn chuẩn quyết định)  
**Approach:** Giữ tầm nhìn hệ thống lớn (7 service, Kafka, sync Google, AI) từ đầu; sửa mâu thuẫn / lỗ hổng của v2.4; không cắt service.

**Quan hệ spec khác:** [Auth UI Port](./2026-09-28-auth-ui-port-design.md) chỉ port **màn hình UI** (stub, chưa API). Wiring identity thật (email/OTP/Google) thuộc **Phase 1** của spec này — không làm song song như hai “auth production” khác nhau.

> Mục **[CHƯA XÁC MINH]** liệt kê ở §10. Checklist phase chi tiết (đầu việc từng ô) giữ trong v2.4; bảng tổng quan + mọi chỗ lệch đã chỉnh nằm trong v2.5 — khi xung đột, **theo v2.5**.

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
**Definition of Done:** Phase **1 + 1.5** hoàn thành (auth 2 kiểu, core nhóm/task, chat realtime **text** trên Flutter).  
Google sync, Sheets, AI, file đầy đủ (multipart 2GB + ClamAV) **không chặn** mốc này.  
**Đính kèm file trong chat Alpha:** không bắt buộc — chat Alpha ưu tiên text; đính kèm đầy đủ theo Phase **1.6**. Upload tối giản (một shot) chỉ nếu cần demo, không thay 1.6.

---

## 2. Kiến trúc tổng thể

### 2.1 Service (7) — giữ như v2.4

| # | Service | Trách nhiệm |
|---|---------|-------------|
| 1 | `api-gateway` | JWT, rate limit, correlation-id, định tuyến, SSE `/ai/*` |
| 2 | `identity-service` | Google OAuth2 + PKCE, email/password + OTP, JWT, token Google mã hoá, `google_sub`, `account_type`, `UserLoggedIn`, token nhân danh AI |
| 3 | `core-service` | Group, task, đa assignee, transfer, audit, outbox; **invalidate cache** membership/task khi ghi |
| 4 | `chat-service` | Hội thoại, tin nhắn, file, WebSocket (Socket.IO + Redis), media worker; **invalidate/cập nhật** last-N + file metadata cache |
| 5 | `google-sync-service` | Planner, `sync_jobs`, Tasks/Sheets, poller, delta sync, limiter, webhook Drive |
| 6 | `messaging-service` | Chat app HTTP (bot), **email (OTP/reset/digest)**, thông báo; sau này bridge Events API |
| 7 | `ai-service` | Orchestrator LLM, tools, link resolver, retrieval, guardrails, audit, chi phí |

### 2.2 Sơ đồ luồng (đã chỉnh client)

```
Flutter (iOS/Android/Web) ──REST──► api-gateway ──► identity | core | chat | ai
     │                                      (sync, messaging: nội bộ)
     ├──WSS────► chat-service ◄──► Redis (rt: fan-out/presence/typing | cache: đọc)
     └──SSE──────► api-gateway ──► ai-service

core / chat ──outbox──► KAFKA ──► google-sync | messaging | chat media | ai indexer
Google Chat ──HTTP──► messaging ──REST──► core / ai
Drive push ──► webhook google-sync
```

**WebSocket:** chỉ **WSS** (TLS); JWT bắt buộc trước khi join room/subscribe; làm mới token qua socket như v2.4; không đi qua api-gateway nhưng cùng issuer JWT với REST. CORS/origin allowlist theo env.

### 2.3 Kafka, tech stack, monorepo
Giữ quy ước v2.4: một topic / aggregate; `aggregateVersion`; idempotent `processed_events`; Transactional Outbox; envelope `eventId`, `correlationId`, `actor.via` (`user` | `ai-assistant` | `google` | `system`).

Stack: Node.js LTS, Express, TypeScript, Socket.IO + Redis adapter, Postgres, Redis, kafkajs, Zod, StorageProvider (MinIO local → R2/S3/GCS), ClamAV, pgvector, Vitest + Testcontainers, googleapis, pnpm + Turborepo, OpenTelemetry + pino.

**Bổ sung bắt buộc:** OpenAPI (hoặc contract HTTP tương đương) từ Phase 1 để Flutter tích hợp; contract Kafka giữ trong `packages/contracts`.

### 2.4 `google.signals` → core (làm chặt)
- Chỉ `google-sync-service` được đưa signal vào đường này (network policy + service token nội bộ).
- Core áp dụng trong transaction theo bảng merge field-level; ghi `task_events` với `actor.via = google`.
- Từ chối hoặc merge có kiểm soát khi version/etag lệch — không ghi đè im lặng trái quy tắc.

### 2.5 Ai sở hữu cache (chốt)
| Key prefix / dữ liệu | Ghi DB | Xóa hoặc cập nhật cache |
|----------------------|--------|-------------------------|
| `cache:group:*` membership, task list/detail | `core-service` | **core-service** ngay trong request ghi (best-effort) **và** consumer nội bộ/outbox cùng service khi event commit — **invalidate-only** (DELETE key), không write-through |
| `cache:conv:*` last-N | `chat-service` | **chat-service** cập nhật last-N hoặc DELETE key khi ghi/sửa/xoá tin |
| `cache:file:*` metadata | `chat-service` | **chat-service** (media worker) invalidate khi trạng thái file đổi |
| `rt:*` | chat-service | Không dùng làm cache nghiệp vụ; không flush khi reconnect |
| Ops flush `cache:*` | — | Chỉ admin nền tảng / runbook (messaging hoặc tool ops), audit |

Package dùng chung (`packages/common` hoặc `cache-keys`) định nghĩa tên key — tránh mỗi service tự đặt lệch.

---

## 3. Auth (Phase 1)

### 3.1 Hai phương thức
1. **Google OAuth2 + PKCE** — chính cho sync Google; lưu refresh mã hoá; `account_type` Workspace/cá nhân.
2. **Email/password + OTP** — đăng ký, verify, forgot/reset; hash **Argon2id** (hoặc tương đương); OTP TTL ngắn.

### 3.2 Kênh OTP / reset
- OTP và link/reset gửi **email** qua `messaging-service` (SMTP/provider).  
- **SMS không** nằm Phase 1 (có thể mở sau).  
- UI có thể vẫn có field “SĐT” từ auth-ui-port nhưng Phase 1 chỉ nghiệm thu **email** làm định danh OTP trừ khi có quyết định mới.

### 3.3 Liên kết tài khoản & Google sync
- Một user có thể có cả `google_sub` và credential email.
- Google đăng nhập trùng email đã có **không** merge ngầm: bắt buộc bước xác nhận liên kết; audit link/unlink.
- JWT/refresh thống nhất cho mọi phương thức đăng nhập.
- **Tài khoản email-only:** dùng đủ core + chat. Bật Google Tasks/Sheets/Chat sync **chỉ sau khi** đã liên kết Google (OAuth) và có refresh token hợp lệ; UI ẩn hoặc disable sync + copy giải thích nếu chưa liên kết.

### 3.4 Bảo vệ
- Rate limit riêng `/auth/*` (login, OTP, reset) trên gateway; khóa tạm sau N lần sai.
- Chuyển OAuth app sang "In production" sớm (tránh refresh Google 7 ngày ở Testing).
- Gợi ý số (chốt fine-tune trong implementation plan): login 10/phút/IP; OTP gửi 5/giờ/email; OTP thử 5/10 phút rồi khóa tạm.

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

### 4.2 Cache Redis — mức B (cache-aside + **invalidate-only** cho membership/task)

| Dữ liệu | Chiến lược |
|---------|------------|
| Membership / `group_members` | Key theo `groupId`; **DELETE** khi đổi member (không write-through) |
| Task list theo nhóm | Key theo `groupId` (+ filter hash); **DELETE** khi `task.events` / ghi task |
| Task chi tiết | Key `taskId` + `version`; miss → DB; đổi version → DELETE key cũ |
| Last-N messages | N = 50–100; **cập nhật** cửa sổ hoặc DELETE conversation key; ngoài cửa sổ → Postgres `after_seq` |
| File metadata | Cache row metadata; **URL ký** chỉ TTL ngắn hơn hạn chữ ký |
| Thumbnail / static file domain | CDN hoặc cache HTTP trên domain file riêng |
| Google access token + limiter | In-memory nếu 1 replica `google-sync`; **Redis** khi nhiều replica |
| AI: danh sách nhóm của user | **Không** cache dài; TTL rất ngắn chỉ nếu đo được bottleneck |

**Nguồn chuẩn vẫn là DB.** Mọi `cache:*` **bắt buộc có TTL** (ví dụ membership/task 30–60s floor + invalidate sớm hơn khi có event).

### 4.3 Xóa / cập nhật cache (bắt buộc có)

| Sự kiện | Hành vi |
|---------|---------|
| Ghi task/group/member | `core-service` DELETE key liên quan (idempotent) |
| Tin nhắn mới/sửa/xoá | `chat-service` cập nhật last-N hoặc DELETE |
| File READY / đổi metadata | `chat-service` invalidate metadata; không giữ URL ký lâu |
| User bị xoá khỏi nhóm | Invalidate membership **ngay** |
| Ops flush | Admin nền tảng; auth + audit; **không** API cho client |

**Cấm:** client tự gọi “xóa cache”; flush-all khi WebSocket/Kafka reconnect; dùng Redis làm nguồn ghi; write-through task list/membership.

Stampede: singleflight / lock ngắn khi miss hàng loạt.

### 4.4 Redis eviction (chốt — hết mâu thuẫn)
- **Một Redis** dùng chung được **nếu**:
  - Mọi key `cache:*` có `EXPIRE` / TTL;
  - Policy: **`volatile-lru`** (hoặc `volatile-ttl`) — chỉ evict key **có TTL**;
  - Key `rt:*` (adapter Socket.IO, presence, typing) **không** đặt TTL kiểu cache (hoặc TTL dài + refresh); nhờ đó `volatile-*` **không** ưu tiên đá realtime trước.
- **Cấm `allkeys-lru`** khi cùng instance với `rt:*`.
- Hết RAM trên `cache:*` → miss + đọc DB; dữ liệu chuẩn không đổi.
- Nếu monitor cho thấy `rt:*` vẫn bị ảnh hưởng: tách Redis thứ hai (realtime vs cache) — cùng interface.

### 4.5 Gắn phase
- Phase 0–1: convention key, TTL bắt buộc trên `cache:*`, policy `volatile-lru`.
- Phase 1: membership + task list/detail cache (invalidate từ core).
- Phase 1.5: last-N messages (chat).
- Phase 1.6: file metadata + CDN/domain file.
- Phase 2: Redis limiter khi scale google-sync.
- Phase 5: đo hit rate, eviction, diễn tập OOM.

---

## 5. Chống trùng, mất mạng, OOM, chống spam

### 5.1 Chống trùng lặp (giữ v2.4 + bổ sung cache)
- Kafka: `eventId`, `processed_events`, `aggregateVersion`.
- Chat: `client_msg_id`; bù `after_seq` / `last_seq`.
- Sync: debounce job, `content_hash`, `CREATING` + marker `[app:taskId]`.
- Bot/bridge: dedupe sự kiện Chat; `message.name + updateTime` khi làm 3.5.
- File: `sha256` trong nhóm.
- AI 6b (khi mở): `idempotency_key`.
- Cache invalidate idempotent (DELETE nhiều lần an toàn).

### 5.2 Mất mạng
- Chat/file: hàng đợi offline client, resume upload (1.6), reconnect + bù seq.
- **Không** flush toàn bộ cache khi reconnect Kafka/WebSocket.
- Consumer bắt lại → chỉ event chưa `processed`; invalidate theo từng sự kiện ghi.
- Flutter: sau reconnect **ưu tiên bù từ API**; cache local chỉ UX.

### 5.3 Hết bộ nhớ (process)
- Giới hạn body size trên gateway/chat.
- Hàng đợi bền vững: outbox / `sync_jobs` trong DB — không buffer vô hạn in-memory.
- Redis: xem §4.4.

### 5.4 Chống spam
- Gateway rate limit chung + 429 thống nhất; correlation-id.
- `/auth/*`: như §3.4.
- Chat: gợi ý 30 tin/phút/user/conversation (chốt trong plan); giới hạn kích thước body; throttle khi vượt.
- Upload: rate limit theo user (ngoài quota dung lượng).
- AI: câu hỏi/phút, token/ngày, max tool loops, timeout (6a).
- Messaging: digest/gom thông báo.
- **Cấm** client flush cache; ops flush có audit.

### 5.5 Push thông báo (Flutter)
- Phase 1.7 v2.4 nêu web push: với Flutter, ưu tiên **FCM** (Android) + **APNs** (iOS); Flutter web dùng web push nếu cần.
- Chi tiết provider/chọn phase: chốt trong implementation plan 1.7 — không chặn Alpha (1 + 1.5).

---

## 6. File & quota

- Trần mặc định tạm: **2 GB/file**, **50 GB/nhóm**; OWNER/ADMIN có thể tăng hoặc `null` = không giới hạn.
- Bỏ mọi wording “không đặt giới hạn nhân tạo”.
- Phase 1.6: multipart, ClamAV, MIME theo nội dung, domain riêng, signed URL, orphan cleanup — như v2.4.
- Alpha: không yêu cầu đính kèm chat đầy đủ (§1.4).

Storage: local MinIO; production mặc định tạm **Cloudflare R2** (S3-compatible) — đổi được (§10).

---

## 7. Lộ trình phase

### 7.1 Vai trò đội (như v2.4)
**BE1** core/identity · **BE2** chat/realtime · **BE3** Google sync · **FE** Flutter · **DevOps/QA** hạ tầng, test, CI.

### 7.2 Tổng quan phase (kế thừa v2.4 + chỉnh v2.5)

| Phase | Nội dung | Thời gian | Phụ thuộc | Ghi chú v2.5 |
|-------|----------|-----------|-----------|--------------|
| 0 | Monorepo, hạ tầng, khung service | ~1 tuần | – | + Redis key convention, `volatile-lru` |
| 1 | identity + core + Flutter tối thiểu | 3 tuần | 0 | Dual auth, OpenAPI, cache membership/task, link Google để sync |
| 1.5 | chat-service realtime (text) | 2 tuần | 1 (một phần) | + last-N cache, chat rate limit; Alpha DoD |
| 1.6 | File đầy đủ | 2 tuần | 1.5 | + metadata cache/CDN |
| 1.7 | Reaction, mention, tìm kiếm, push | 1 tuần | 1.5 | FCM/APNs (Flutter) |
| 2 | Sync framework + Tasks một chiều | 2 tuần | 1 | Chỉ user đã liên kết Google |
| 2.5 | Đồng bộ ngược + delta | 2 tuần | 2 | |
| 3 | Spike Chat + bot + email | 2 tuần | 1 | **Gate** ADR trước khi cam kết bridge |
| 4 | Sheets | 1–2 tuần | 2 | |
| 5 | Củng cố, load test, runbook | 2 tuần | các phase trên | + cache hit/eviction/flush |
| 6a | AI chỉ đọc + link | 2 tuần | 1 | Phạm vi AI hiện tại |
| 6b | AI hành động có xác nhận | 2 tuần | 6a | **Tạm hoãn** |
| 6c–6e | Semantic / admin AI / Chat AI | 1–2 tuần từng phần | xem v2.4 | |
| 3.5 | Bridge Chat hai chiều | 3 tuần | 3, 1.5 | Tuỳ chọn |

**Internal Alpha:** sau Phase **1 + 1.5**. Sync/AI/1.6 **không chặn**.

Checklist ô việc chi tiết: xem [v2.4](./2026-09-28-ke-hoach-trien-khai-v2.4.md) § Phase tương ứng, áp dụng cột “Ghi chú v2.5” và các mục §3–§5 ở trên.

### 7.3 Gợi ý song song
Tuần 1: Phase 0. Tuần 2–4: BE1+FE Phase 1; BE2 khởi động 1.5 khi có identity+group; BE3 khung Phase 2; DevOps CI. Tuần 5–6: hướng Alpha (1.5 xong). Tuần 5–8: 1.6/1.7, 2→2.5, Phase 3 spike, 6a song song không chặn Alpha.

---

## 8. AI (tóm tắt)

- **Hiện tại (6a):** tool chỉ đọc; link resolver trên server; SSE; audit/usage; token nhân danh.
- **6b tạm hoãn:** tool ghi + `ai_pending_actions` + xác nhận UI — giữ thiết kế tham khảo trong v2.4.
- **6c–6e:** như v2.4; embedding **[CHƯA XÁC MINH]**.

---

## 9. Bảo mật, kiểm thử, rủi ro (bổ sung)

### 9.1 Bảo mật
Giữ hướng v2.4 (JWT ngắn, Google token chỉ identity, scope tối thiểu, quét file, chống SSRF preview, AI injection).  
Thêm: Argon2id; OTP/reset một lần dùng qua email; liên kết account có xác nhận; WSS + JWT trước subscribe; tách domain file; AI 6a không cần `confirmation_id` đến khi mở 6b.

### 9.2 Kiểm thử — thêm
- Ma trận auth: Google-only, email-only, linked, revoke Google; email-only **không** gọi được sync Google.
- OpenAPI + Kafka contract trong CI.
- Alpha gate: 1 + 1.5 text chat (không bắt buộc file 1.6).
- Cache: sau ghi, key bị DELETE; sau Redis volatile eviction, API vẫn đúng; không flush khi reconnect; `allkeys-lru` không được bật trên instance có `rt:*`.
- Spam: vượt rate chat/auth → 429.
- Reconnect Flutter web + một mobile target.

### 9.3 Rủi ro — thêm
| Rủi ro | Giảm thiểu |
|--------|------------|
| Đội nhỏ + 7 service | Alpha sớm; health/DLQ tối thiểu từ Phase 0–1 |
| Hai kiểu đăng nhập / chiếm email | Luật liên kết + test + audit |
| Email-only bật sync lỗi | Bắt buộc liên kết Google (§3.3) |
| Flutter lệch web vs mobile | Nghiệm thu reconnect cả hai |
| Cache stale / stampede | Invalidate-only; singleflight; TTL; DB chuẩn |
| Redis OOM đá realtime | `volatile-lru` + TTL chỉ trên `cache:*`; cấm `allkeys-lru` chung instance |
| Spam chat/OTP | §3.4 / §5.4 |
| Spec lệch auth-ui-port | UI stub trước; API Phase 1 (§ đầu trang) |
| Quota Google / chi phí AI | Như v2.4; đo Phase 5 |

---

## 10. Đã / chưa xác minh & quyết định mở

### 10.1 Chưa xác minh (sao kê từ v2.4 — spike / đọc lại docs)
- Gmail cá nhân với Chat / Events API.
- Auth `chat.app.*` và việc admin Workspace duyệt.
- Tải file đính kèm Chat bằng app auth.
- Phân loại scope đọc tin nhắn; hạn mức Chat và Events API.
- Batch endpoint / push của Tasks API.
- Thời gian phản hồi tối đa của Chat HTTP endpoint.
- Link web ổn định của Google Tasks.
- Model string / giá / chính sách dữ liệu nhà cung cấp LLM.
- Chất lượng embedding tiếng Việt (Voyage vs self-host).

### 10.2 Đã chốt trong v2.5
- Flutter là client chính; auth-ui-port = UI trước Phase 1 API.
- Auth: Google + email/OTP (email); SMS sau.
- Email-only phải link Google mới sync.
- File: trần/quota mặc định; có thể `null`.
- AI: tầm nhìn có 6b; ship hiện tại chỉ 6a.
- Internal Alpha = 1 + 1.5 (text); file đầy đủ = 1.6.
- Cache mức B; invalidate-only membership/task; owner = core/chat; ops flush có audit.
- Redis: `volatile-lru` + TTL trên `cache:*`; cấm `allkeys-lru` chung với `rt:*`.
- Giữ 7 service / Kafka từ đầu.
- v2.4 lưu trong repo cạnh spec này.

### 10.3 Còn mở (có mặc định tạm)

| # | Việc | Mặc định tạm |
|---|------|----------------|
| 1 | Storage production | R2 (S3-compatible); MinIO local |
| 2 | Số GB trần/quota | 2 GB/file, 50 GB/nhóm |
| 3 | Embedding 6c | Chọn khi làm 6c |
| 4 | Bridge 3.5 | Sau spike + nhu cầu |
| 5 | Thời điểm 6c | Sau Alpha + 6a ổn |
| 6 | Số rate limit chính xác | Gợi ý §3.4 / §5.4; fine-tune trong plan |
| 7 | Tách Redis 2 instance | Chỉ khi monitor yêu cầu |

---

## 11. Bước tiếp theo
1. User review spec này; chỉnh nếu cần.
2. Viết implementation plan (writing-plans) từ spec đã duyệt.
3. Phase 0 → Phase 1 (+ cache/auth) → 1.5 → Internal Alpha; sync/AI song song theo lịch đội.

---

## 12. Changelog so với v2.4
- Client: Flutter thay web-app mặc định.
- Auth dual + luật liên kết + OTP email + email-only không sync đến khi link Google.
- Mục tiêu file/AI/tầm nhìn vs phạm vi hiện tại — hết mâu thuẫn.
- Internal Alpha DoD (text chat).
- OpenAPI từ Phase 1; siết `google.signals`.
- Cache mức B, owner rõ, invalidate-only, ops flush, SLO.
- Redis eviction chốt `volatile-lru`; cấm `allkeys-lru` chung realtime.
- OOM / mất mạng / chống spam; FCM/APNs cho Flutter.
- Gate spike Phase 3; v2.4 check-in repo; quan hệ auth-ui-port.
- Mặc định tạm storage/quota.

## 13. Changelog sửa sau review nội bộ (cùng ngày)
- Check-in file v2.4 vào `docs/superpowers/specs/`.
- Làm rõ auth-ui-port vs Phase 1.
- Chốt Redis eviction; cache owner; invalidate-only.
- OTP = email qua messaging; sync cần Google link.
- WSS + JWT; Alpha không bắt buộc file; liệt kê [CHƯA XÁC MINH]; bảng phase + vai trò; push Flutter.
