-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('team', 'project', 'direct');

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "project_id" TEXT,
    "name" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachment_file_id" TEXT,
    "reply_to_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_read_status" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_read_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channels_team_id_idx" ON "channels"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "channels_team_id_type_key" ON "channels"("team_id", "type");

-- CreateIndex
CREATE INDEX "messages_channel_id_created_at_idx" ON "messages"("channel_id", "created_at");

-- CreateIndex
CREATE INDEX "message_read_status_user_id_idx" ON "message_read_status"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_read_status_message_id_user_id_key" ON "message_read_status"("message_id", "user_id");

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_attachment_file_id_fkey" FOREIGN KEY ("attachment_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_read_status" ADD CONSTRAINT "message_read_status_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_read_status" ADD CONSTRAINT "message_read_status_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
