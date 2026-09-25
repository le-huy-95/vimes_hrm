-- CreateEnum
CREATE TYPE "GoogleTasksListKind" AS ENUM ('todo', 'doing', 'done');

-- AlterEnum
ALTER TYPE "OAuthProvider" ADD VALUE 'google_tasks';

-- CreateTable
CREATE TABLE "team_google_tasks_settings" (
    "team_id" TEXT NOT NULL,
    "todo_list_id" TEXT,
    "doing_list_id" TEXT,
    "done_list_id" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "connected_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_google_tasks_settings_pkey" PRIMARY KEY ("team_id")
);

-- CreateTable
CREATE TABLE "google_tasks" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "google_task_id" TEXT NOT NULL,
    "list_kind" "GoogleTasksListKind" NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "google_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "google_tasks_team_id_list_kind_idx" ON "google_tasks"("team_id", "list_kind");

-- CreateIndex
CREATE UNIQUE INDEX "google_tasks_team_id_google_task_id_key" ON "google_tasks"("team_id", "google_task_id");

-- AddForeignKey
ALTER TABLE "team_google_tasks_settings" ADD CONSTRAINT "team_google_tasks_settings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_google_tasks_settings" ADD CONSTRAINT "team_google_tasks_settings_connected_by_user_id_fkey" FOREIGN KEY ("connected_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_tasks" ADD CONSTRAINT "google_tasks_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
