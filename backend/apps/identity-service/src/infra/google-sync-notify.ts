import { createLogger } from "@manage-teams/lib";

const logger = createLogger("identity-service");
const googleSyncUrl = (process.env.GOOGLE_SYNC_URL ?? "http://localhost:3207").replace(/\/$/, "");
const internalToken = process.env.INTERNAL_SERVICE_TOKEN ?? "dev-internal-token";

/** Sau login: enqueue TASKS_PULL nền (delta sync Phase 2.5). Non-fatal. */
export function notifyGoogleTaskPull(userId: string): void {
  void fetch(`${googleSyncUrl}/internal/sync/tasks/pull`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": internalToken,
    },
    body: JSON.stringify({ userId, force: false }),
  }).catch((err) => {
    logger.warn({ err }, "google sync pull notify failed (non-fatal)");
  });
}
