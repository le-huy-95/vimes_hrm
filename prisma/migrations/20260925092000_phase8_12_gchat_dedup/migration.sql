CREATE TYPE "GchatSyncStatus" AS ENUM ('active', 'expired', 'error');
CREATE TYPE "GchatMessageSource" AS ENUM ('google', 'app');
CREATE TYPE "GchatMessageSyncStatus" AS ENUM ('pending', 'sent', 'confirmed', 'failed');

CREATE TABLE "gchat_spaces" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "google_space_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "subscription_id" TEXT,
    "subscription_expire_time" TIMESTAMP(3),
    "sync_status" "GchatSyncStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gchat_spaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gchat_dm_mapping" (
    "id" TEXT NOT NULL,
    "user_a_id" TEXT NOT NULL,
    "user_b_id" TEXT NOT NULL,
    "google_space_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gchat_dm_mapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gchat_messages" (
    "id" TEXT NOT NULL,
    "gchat_space_id" TEXT NOT NULL,
    "google_message_id" TEXT NOT NULL,
    "sender_google_id" TEXT,
    "sender_user_id" TEXT,
    "text_content" TEXT NOT NULL,
    "thread_id" TEXT,
    "source" "GchatMessageSource" NOT NULL,
    "sync_status" "GchatMessageSyncStatus" NOT NULL DEFAULT 'pending',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_time" TIMESTAMP(3) NOT NULL,
    "updated_time" TIMESTAMP(3),
    "raw_payload" JSONB,
    CONSTRAINT "gchat_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gchat_subscription_health" (
    "id" TEXT NOT NULL,
    "gchat_space_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "last_event_received_at" TIMESTAMP(3),
    "last_renew_at" TIMESTAMP(3),
    "error_message" TEXT,
    CONSTRAINT "gchat_subscription_health_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gchat_spaces_google_space_id_key" ON "gchat_spaces"("google_space_id");
CREATE INDEX "gchat_spaces_team_id_idx" ON "gchat_spaces"("team_id");
CREATE UNIQUE INDEX "gchat_dm_mapping_user_a_id_user_b_id_key" ON "gchat_dm_mapping"("user_a_id", "user_b_id");
CREATE INDEX "gchat_dm_mapping_google_space_id_idx" ON "gchat_dm_mapping"("google_space_id");
CREATE UNIQUE INDEX "gchat_messages_google_message_id_key" ON "gchat_messages"("google_message_id");
CREATE INDEX "gchat_messages_gchat_space_id_created_time_idx" ON "gchat_messages"("gchat_space_id", "created_time");
CREATE UNIQUE INDEX "gchat_subscription_health_gchat_space_id_key" ON "gchat_subscription_health"("gchat_space_id");
CREATE UNIQUE INDEX "idempotency_keys_key_user_id_key" ON "idempotency_keys"("key", "user_id");
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

ALTER TABLE "gchat_spaces" ADD CONSTRAINT "gchat_spaces_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gchat_messages" ADD CONSTRAINT "gchat_messages_gchat_space_id_fkey" FOREIGN KEY ("gchat_space_id") REFERENCES "gchat_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gchat_messages" ADD CONSTRAINT "gchat_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gchat_subscription_health" ADD CONSTRAINT "gchat_subscription_health_gchat_space_id_fkey" FOREIGN KEY ("gchat_space_id") REFERENCES "gchat_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
