# Phase 5 Design — Object Storage (MinIO/S3)

**Date:** 2026-09-25  
**Status:** Implemented  
**Depends on:** Phase 1 (users.avatar_file_id), Phase 4 (tasks)  
**Scope:** **A** — MinIO in Compose + API (presign/confirm/download URL) + thumbnail BullMQ job + wire avatar + task_attachments. No CDN, no web UI.

---

## 1. Goals

- Docker Compose: MinIO (+ create default bucket via init or API on boot).
- `files` table: metadata only; binaries in object storage.
- `POST /files/presign` → PUT URL; client uploads directly.
- `POST /files/confirm` → HEAD object, write `files` row; enqueue thumbnail if image.
- `GET /files/:id` → metadata + short-lived GET URL (and thumbnail URL if any).
- `PATCH /users/me/avatar` or `POST /files/confirm` with `entityType=avatar` sets `users.avatar_file_id`.
- `task_attachments` link file ↔ task; APIs under task routes.
- Thumbnail worker: download original → `sharp` resize → upload `thumbs/{fileId}.jpg` → update `files.thumbnail_key`.

## 2. Non-goals

- CDN / CloudFront.
- Web UI upload widgets.
- Chat attachments (Phase 6).
- Multipart upload for huge files (Phase 5: single PUT, max e.g. 20MB).

## 3. Config

```env
S3_ENDPOINT=http://localhost:9010
S3_REGION=us-east-1
S3_ACCESS_KEY=minio
S3_SECRET_KEY=minio12345
S3_BUCKET=manage-teams
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_URL=http://localhost:9010   # optional base for display; signed URLs preferred
FILE_MAX_BYTES=20971520
```

## 4. Data model

### `files`

| Column | Notes |
|--------|--------|
| id | cuid |
| uploader_id | FK users |
| org_id | denormalized for auth |
| bucket_key | object key |
| thumbnail_key | nullable |
| original_name | |
| mime_type | |
| size_bytes | |
| entity_type | `avatar` \| `task_attachment` \| `other` |
| entity_id | nullable (userId / taskId) |
| status | `pending` \| `confirmed` \| `failed` |
| created_at | |

Presign creates a **pending** intent: either (a) return key only and create row on confirm, or (b) create pending row on confirm only. **Phase 5:** no DB row until confirm (simpler); presign returns `{ uploadUrl, bucketKey, headers }`.

### `task_attachments`

| id, task_id, file_id | UNIQUE(task_id, file_id) |

## 5. API

| Method | Path | Auth |
|--------|------|------|
| POST | `/files/presign` | JWT |
| POST | `/files/confirm` | JWT |
| GET | `/files/:fileId` | JWT (same org) |
| PATCH | `/me/avatar` | JWT — body `{ fileId }` after confirm as avatar |
| POST | `/teams/:teamId/tasks/:taskId/attachments` | task:write — `{ fileId }` |
| GET | `/teams/:teamId/tasks/:taskId/attachments` | team:view |
| DELETE | `/teams/:teamId/tasks/:taskId/attachments/:fileId` | task:write |

Presign body: `{ originalName, mimeType, sizeBytes, entityType, entityId? }`  
Confirm body: `{ bucketKey, originalName, mimeType, sizeBytes, entityType, entityId? }` — verify object exists via HeadObject; size/mime must match allowlist.

Allowed mime: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf` (PDF no thumbnail).

## 6. Code layout

```
src/lib/s3.ts                 # S3Client, presign PUT/GET, head, putBuffer
src/lib/queue.ts              # + thumbnail queue
src/repositories/file.repository.ts
src/repositories/task-attachment.repository.ts
src/services/file.service.ts
src/controllers/file.controller.ts
src/workers/thumbnail.worker.ts
docker-compose.yml            # minio + minio-init
```

Use `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` + `sharp`.

## 7. Decisions

| Decision | Choice |
|----------|--------|
| Scope | A |
| Provider | MinIO local (S3 API) |
| Row timing | Create on confirm |
| Thumbnail | BullMQ + sharp, images only |
| CDN | Deferred |

---

*End of Phase 5 design.*
