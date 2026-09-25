-- CreateEnum
CREATE TYPE "FileEntityType" AS ENUM ('avatar', 'task_attachment', 'other');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('pending', 'confirmed', 'failed');

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "bucket_key" TEXT NOT NULL,
    "thumbnail_key" TEXT,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "entity_type" "FileEntityType" NOT NULL,
    "entity_id" TEXT,
    "status" "FileStatus" NOT NULL DEFAULT 'confirmed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_attachments" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,

    CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_bucket_key_key" ON "files"("bucket_key");

-- CreateIndex
CREATE INDEX "files_org_id_idx" ON "files"("org_id");

-- CreateIndex
CREATE INDEX "files_uploader_id_idx" ON "files"("uploader_id");

-- CreateIndex
CREATE INDEX "files_entity_type_entity_id_idx" ON "files"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "task_attachments_task_id_idx" ON "task_attachments"("task_id");

-- CreateIndex
CREATE INDEX "task_attachments_file_id_idx" ON "task_attachments"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_attachments_task_id_file_id_key" ON "task_attachments"("task_id", "file_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
