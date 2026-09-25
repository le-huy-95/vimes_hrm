# Phase 5 Object Storage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or execute tasks sequentially with commits.

**Goal:** MinIO + S3-compatible presign/confirm APIs, thumbnail worker, avatar + task attachment wiring.

**Architecture:** Client uploads via presigned PUT; API confirms with HeadObject; images enqueue `file-thumbnail` BullMQ job using `sharp`.

**Tech Stack:** `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `sharp`, BullMQ, Prisma, Express, Zod.

**Spec:** `docs/superpowers/specs/2026-09-25-phase5-storage-design.md`

---

### Task 1: Compose + env + deps

- Add MinIO service (ports 9000 API, 9001 console) + `mc` init job to create bucket `manage-teams`
- `.env.example` + `env.ts` S3_* and FILE_MAX_BYTES
- `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner sharp`
- Commit: `feat(storage): add MinIO compose and S3 env`

### Task 2: Prisma File + TaskAttachment

- Models per spec; User.avatarFileId already exists — relate optionally
- Task relation for attachments
- Migrate `phase5_storage`
- Commit: `feat(storage): add files and task_attachments models`

### Task 3: S3 lib + queue + thumbnail worker

- `src/lib/s3.ts`: getClient, ensureBucket (optional on startup), presignPut, presignGet, headObject, putObject, getObjectBuffer
- Queue `FILE_THUMBNAIL_QUEUE`
- Worker: fetch object, sharp resize max 400px jpeg, upload thumb key, update file.thumbnailKey
- Commit: `feat(storage): add S3 helpers and thumbnail worker`

### Task 4: File + attachment API

- Repositories, FileService, FileController
- Routes `/files/*`, `/me/avatar`, task attachment routes
- Wire container + index worker start
- Commit: `feat(storage): add file presign/confirm and attachment APIs`

### Task 5: OpenAPI + verify

- Document endpoints
- `npm test && npx tsc --noEmit`
- Mark spec Implemented
- Commit: `docs(storage): document Phase 5 file APIs`

---

*End of Phase 5 plan.*
