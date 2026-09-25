-- CreateEnum
CREATE TYPE "WorkspaceAuthMode" AS ENUM ('service_account', 'oauth_admin', 'none');

-- CreateEnum
CREATE TYPE "SyncLogStatus" AS ENUM ('running', 'success', 'partial', 'failed');

-- AlterEnum
ALTER TYPE "OAuthProvider" ADD VALUE 'google_workspace';

-- CreateTable
CREATE TABLE "org_workspace_settings" (
    "org_id" TEXT NOT NULL,
    "directory_sync_token" TEXT,
    "last_full_sync_at" TIMESTAMP(3),
    "last_incremental_sync_at" TIMESTAMP(3),
    "auth_mode" "WorkspaceAuthMode" NOT NULL DEFAULT 'none',
    "sync_cursor_page_token" TEXT,
    "workspace_oauth_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_workspace_settings_pkey" PRIMARY KEY ("org_id")
);

-- CreateTable
CREATE TABLE "google_workspace_sync" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "google_user_id" TEXT NOT NULL,
    "primary_email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "org_unit" TEXT,
    "photo_url" TEXT,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "linked_user_id" TEXT,
    "content_hash" TEXT NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_workspace_sync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_group_team_maps" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "google_group_id" TEXT NOT NULL,
    "google_group_email" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,

    CONSTRAINT "google_group_team_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "status" "SyncLogStatus" NOT NULL,
    "error_message" TEXT,
    "meta" JSONB,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "google_workspace_sync_org_id_primary_email_idx" ON "google_workspace_sync"("org_id", "primary_email");

-- CreateIndex
CREATE INDEX "google_workspace_sync_org_id_last_synced_at_idx" ON "google_workspace_sync"("org_id", "last_synced_at");

-- CreateIndex
CREATE UNIQUE INDEX "google_workspace_sync_org_id_google_user_id_key" ON "google_workspace_sync"("org_id", "google_user_id");

-- CreateIndex
CREATE INDEX "google_group_team_maps_org_id_idx" ON "google_group_team_maps"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "google_group_team_maps_org_id_google_group_id_key" ON "google_group_team_maps"("org_id", "google_group_id");

-- CreateIndex
CREATE INDEX "sync_logs_org_id_run_at_idx" ON "sync_logs"("org_id", "run_at" DESC);

-- AddForeignKey
ALTER TABLE "org_workspace_settings" ADD CONSTRAINT "org_workspace_settings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_workspace_sync" ADD CONSTRAINT "google_workspace_sync_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_workspace_sync" ADD CONSTRAINT "google_workspace_sync_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_group_team_maps" ADD CONSTRAINT "google_group_team_maps_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_group_team_maps" ADD CONSTRAINT "google_group_team_maps_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
