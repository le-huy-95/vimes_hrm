-- CreateEnum
CREATE TYPE "GithubAccountType" AS ENUM ('Organization', 'User');

-- CreateEnum
CREATE TYPE "GithubDeliveryStatus" AS ENUM ('accepted', 'processed', 'ignored', 'failed');

-- CreateTable
CREATE TABLE "github_connections" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "installation_id" BIGINT NOT NULL,
    "github_account_login" TEXT NOT NULL,
    "github_account_type" "GithubAccountType" NOT NULL,
    "github_team_id" BIGINT,
    "connected_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_repos" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "github_repo_id" BIGINT NOT NULL,
    "full_name" TEXT NOT NULL,
    "default_branch" TEXT,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "html_url" TEXT NOT NULL,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_repos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_webhook_deliveries" (
    "id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "action" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "status" "GithubDeliveryStatus" NOT NULL DEFAULT 'accepted',

    CONSTRAINT "github_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_activity_events" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "repo_id" TEXT,
    "event_type" TEXT NOT NULL,
    "action" TEXT,
    "actor_login" TEXT,
    "title" TEXT NOT NULL,
    "external_url" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "github_activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "github_connections_team_id_key" ON "github_connections"("team_id");

-- CreateIndex
CREATE INDEX "github_connections_installation_id_idx" ON "github_connections"("installation_id");

-- CreateIndex
CREATE INDEX "github_connections_org_id_idx" ON "github_connections"("org_id");

-- CreateIndex
CREATE INDEX "github_repos_team_id_idx" ON "github_repos"("team_id");

-- CreateIndex
CREATE INDEX "github_repos_connection_id_idx" ON "github_repos"("connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "github_repos_team_id_github_repo_id_key" ON "github_repos"("team_id", "github_repo_id");

-- CreateIndex
CREATE UNIQUE INDEX "github_webhook_deliveries_delivery_id_key" ON "github_webhook_deliveries"("delivery_id");

-- CreateIndex
CREATE UNIQUE INDEX "github_activity_events_dedupe_key_key" ON "github_activity_events"("dedupe_key");

-- CreateIndex
CREATE INDEX "github_activity_events_team_id_occurred_at_idx" ON "github_activity_events"("team_id", "occurred_at" DESC);

-- AddForeignKey
ALTER TABLE "github_connections" ADD CONSTRAINT "github_connections_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_connections" ADD CONSTRAINT "github_connections_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_connections" ADD CONSTRAINT "github_connections_connected_by_user_id_fkey" FOREIGN KEY ("connected_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_repos" ADD CONSTRAINT "github_repos_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_repos" ADD CONSTRAINT "github_repos_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "github_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_activity_events" ADD CONSTRAINT "github_activity_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_activity_events" ADD CONSTRAINT "github_activity_events_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "github_repos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
