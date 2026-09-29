import { prismaRead, prismaWrite } from "@manage-teams/db";
import { AppError, createLogger } from "@manage-teams/lib";
import { createHash } from "node:crypto";

const logger = createLogger("google-sync-service");
const chatUrl = (process.env.CHAT_URL ?? "http://localhost:3204").replace(/\/$/, "");
const workerUrl = (process.env.WORKER_URL ?? "http://localhost:3206").replace(/\/$/, "");
const internalToken = process.env.INTERNAL_SERVICE_TOKEN ?? "dev-internal-token";

export type RegisterSpaceInput = {
  spaceName: string;
  groupId: string;
  conversationId: string;
  chatIngestEnabled?: boolean;
};

/** Đăng ký map Google Chat space ↔ conversation nhóm. */
export async function registerChatSpace(input: RegisterSpaceInput) {
  const space = await prismaWrite.googleChatSpace.upsert({
    where: { spaceName: input.spaceName },
    create: {
      spaceName: input.spaceName,
      groupId: input.groupId,
      conversationId: input.conversationId,
      chatIngestEnabled: input.chatIngestEnabled ?? true,
      status: "ACTIVE",
    },
    update: {
      groupId: input.groupId,
      conversationId: input.conversationId,
      chatIngestEnabled: input.chatIngestEnabled ?? true,
      status: "ACTIVE",
      updatedAt: new Date(),
    },
  });

  await prismaWrite.chatWatchState.upsert({
    where: { spaceId: space.id },
    create: {
      spaceId: space.id,
      status: "ACTIVE",
      expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      lastRenewAt: new Date(),
    },
    update: {
      status: "ACTIVE",
      expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      lastRenewAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return {
    id: space.id,
    spaceName: space.spaceName,
    groupId: space.groupId,
    conversationId: space.conversationId,
    chatIngestEnabled: space.chatIngestEnabled,
  };
}

export type EgressInput = {
  conversationId: string;
  messageId: string;
  body: string;
  origin?: string;
};

/**
 * Phase 3.5: đẩy tin app → Google Chat (stub).
 * Bỏ qua nếu origin=GOOGLE_CHAT (chống vòng lặp).
 * Production: gọi Chat API spaces.messages.create.
 */
export async function egressAppMessageToGoogleChat(input: EgressInput) {
  if (input.origin === "GOOGLE_CHAT") {
    return { ok: true as const, skipped: true as const, reason: "anti_loop" };
  }

  const space = await prismaRead.googleChatSpace.findFirst({
    where: { conversationId: input.conversationId, chatIngestEnabled: true, status: "ACTIVE" },
  });
  if (!space) {
    return { ok: true as const, skipped: true as const, reason: "no_space_mapping" };
  }

  // Đã egress message này?
  const googleName = `spaces/${space.spaceName}/messages/app-${input.messageId}`;
  const existing = await prismaRead.googleMessageMap.findUnique({
    where: { googleMessageName: googleName },
  });
  if (existing) {
    return { ok: true as const, skipped: true as const, reason: "already_egressed", deduped: true };
  }

  const useRealApi = process.env.GOOGLE_CHAT_EGRESS_ENABLED === "true";
  if (!useRealApi) {
    await prismaWrite.googleMessageMap.create({
      data: {
        googleMessageName: googleName,
        messageId: input.messageId,
        spaceId: space.id,
        googleUpdateTime: new Date(),
      },
    });
    logger.info(
      { spaceName: space.spaceName, messageId: input.messageId, bodyPreview: input.body.slice(0, 80) },
      "egress stub → Google Chat (set GOOGLE_CHAT_EGRESS_ENABLED=true for real API)",
    );
    return { ok: true as const, stub: true as const, googleMessageName: googleName };
  }

  // Real API placeholder — cần service account Chat
  throw new AppError(
    "GOOGLE_CHAT_EGRESS_ENABLED nhưng chưa cấu hình Chat service account",
    "CHAT_EGRESS_NOT_CONFIGURED",
    501,
  );
}

/** Email fallback khi user không dùng được Chat (Phase 3). */
export async function sendChatEmailFallback(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: boolean; stub?: boolean }> {
  try {
    const res = await fetch(`${workerUrl}/internal/email/send`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": internalToken,
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "chat email fallback failed");
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logger.warn({ err }, "chat email fallback error");
    return { ok: false };
  }
}

export type IngestGoogleChatInput = {
  spaceName: string;
  googleMessageName: string;
  googleUpdateTime?: string;
  body: string;
  senderUserId: string;
  conversationId: string;
  groupId?: string;
};

/**
 * Phase 3.5: map Google Chat message → chat-service (origin=GOOGLE_CHAT).
 */
export async function ingestGoogleChatMessage(input: IngestGoogleChatInput) {
  const existing = await prismaRead.googleMessageMap.findUnique({
    where: { googleMessageName: input.googleMessageName },
  });
  if (existing) {
    return { ok: true as const, deduped: true as const, messageId: existing.messageId };
  }

  let space = await prismaRead.googleChatSpace.findUnique({
    where: { spaceName: input.spaceName },
  });
  if (!space) {
    space = await prismaWrite.googleChatSpace.create({
      data: {
        spaceName: input.spaceName,
        groupId: input.groupId ?? null,
        conversationId: input.conversationId,
        chatIngestEnabled: true,
        status: "ACTIVE",
      },
    });
    await prismaWrite.chatWatchState.create({
      data: {
        spaceId: space.id,
        status: "ACTIVE",
        expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastRenewAt: new Date(),
      },
    });
  } else if (!space.chatIngestEnabled) {
    throw new AppError("Ingest disabled for space", "INGEST_DISABLED", 403);
  }

  const clientMsgId = createHash("sha256")
    .update(input.googleMessageName)
    .digest("hex")
    .slice(0, 32);

  const res = await fetch(`${chatUrl}/internal/conversations/ingest-external`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": internalToken,
    },
    body: JSON.stringify({
      conversationId: input.conversationId || space.conversationId,
      senderUserId: input.senderUserId,
      body: input.body,
      clientMsgId,
      origin: "GOOGLE_CHAT",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new AppError(`chat ingest failed: ${text}`, "CHAT_INGEST_FAILED", 502);
  }
  const payload = (await res.json()) as { message?: { id?: string }; deduped?: boolean };
  const messageId = payload.message?.id;
  if (!messageId) throw new AppError("chat ingest missing message id", "CHAT_INGEST_FAILED", 502);

  await prismaWrite.googleMessageMap.create({
    data: {
      googleMessageName: input.googleMessageName,
      googleUpdateTime: input.googleUpdateTime ? new Date(input.googleUpdateTime) : null,
      messageId,
      spaceId: space.id,
    },
  });

  await prismaWrite.chatWatchState.updateMany({
    where: { spaceId: space.id },
    data: { lastEventAt: new Date(), updatedAt: new Date() },
  });

  logger.info({ spaceName: input.spaceName, messageId }, "google chat message ingested");
  return { ok: true as const, deduped: Boolean(payload.deduped), messageId };
}

/** Renew watches sắp hết hạn (< 1/3 TTL còn lại). */
export async function renewExpiringWatches(): Promise<{ renewed: number; degraded: number }> {
  const now = new Date();
  const watches = await prismaRead.chatWatchState.findMany({
    where: { status: { in: ["ACTIVE", "DEGRADED"] } },
    take: 50,
  });
  let renewed = 0;
  let degraded = 0;
  for (const w of watches) {
    if (!w.expireAt) continue;
    const ttl = w.expireAt.getTime() - (w.lastRenewAt?.getTime() ?? w.createdAt.getTime());
    const remaining = w.expireAt.getTime() - now.getTime();
    if (remaining <= 0) {
      await prismaWrite.chatWatchState.update({
        where: { id: w.id },
        data: { status: "DEGRADED", updatedAt: now },
      });
      degraded += 1;
      continue;
    }
    if (ttl > 0 && remaining < ttl / 3) {
      await prismaWrite.chatWatchState.update({
        where: { id: w.id },
        data: {
          lastRenewAt: now,
          expireAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          status: "ACTIVE",
          updatedAt: now,
        },
      });
      renewed += 1;
    }
  }
  logger.info({ renewed, degraded }, "chat watch renew tick");
  return { renewed, degraded };
}
