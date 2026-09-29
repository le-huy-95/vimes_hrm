import { randomUUID } from "node:crypto";
import { createLogger } from "@manage-teams/lib";
import type { EventEnvelope } from "@manage-teams/contracts";

const logger = createLogger("core-service");
const chatInternalUrl = (process.env.CHAT_URL ?? "http://localhost:3204").replace(/\/$/, "");
const googleSyncUrl = (process.env.GOOGLE_SYNC_URL ?? "http://localhost:3207").replace(/\/$/, "");
const internalToken = process.env.INTERNAL_SERVICE_TOKEN ?? "dev-internal-token";

export function envelope(
  partial: Omit<EventEnvelope, "eventId" | "occurredAt" | "correlationId"> & {
    correlationId?: string;
  },
): EventEnvelope {
  return {
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    correlationId: partial.correlationId ?? randomUUID(),
    ...partial,
  };
}

export async function notifyChat(path: string, body: unknown): Promise<void> {
  try {
    await fetch(`${chatInternalUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": internalToken,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logger.warn({ err, path }, "chat notify failed (non-fatal)");
  }
}

/** Enqueue đẩy task lên Google Tasks (non-fatal nếu sync service down). */
export async function notifyGoogleTaskPush(body: {
  userId: string;
  taskId: string;
  title: string;
  notes?: string;
  status?: string;
  due?: string | null;
}): Promise<void> {
  try {
    await fetch(`${googleSyncUrl}/internal/sync/tasks/push`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": internalToken,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logger.warn({ err }, "google sync notify failed (non-fatal)");
  }
}

/** Enqueue kéo delta Google Tasks sau login (non-fatal). */
export async function notifyGoogleTaskPull(userId: string, force = false): Promise<void> {
  try {
    await fetch(`${googleSyncUrl}/internal/sync/tasks/pull`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": internalToken,
      },
      body: JSON.stringify({ userId, force }),
    });
  } catch (err) {
    logger.warn({ err }, "google sync pull notify failed (non-fatal)");
  }
}
