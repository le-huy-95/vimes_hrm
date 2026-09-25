import { PubSub } from "@google-cloud/pubsub";
import { gchatEnabled, env } from "../lib/env.js";
import type { GchatService } from "../services/gchat.service.js";

/**
 * Phase 8: StreamingPull inbound Google Chat events.
 * No-ops when GCHAT_ENABLED is false.
 */
export function startGchatPubSubWorker(gchat: GchatService) {
  if (!gchatEnabled) {
    console.log("[gchat] Pub/Sub worker disabled");
    return {
      async close() {},
    };
  }

  const saJson =
    env.GCHAT_SERVICE_ACCOUNT_JSON?.trim() ||
    env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const credentials = saJson ? JSON.parse(saJson) : undefined;
  const pubsub = new PubSub(
    credentials ? { credentials, projectId: credentials.project_id } : undefined,
  );
  const subscription = pubsub.subscription(env.GCHAT_PUBSUB_SUBSCRIPTION, {
    flowControl: { maxMessages: 50 },
  });

  const handler = async (message: {
    data: Buffer;
    ack: () => void;
    nack: () => void;
  }) => {
    try {
      const payload = JSON.parse(message.data.toString("utf8")) as Record<
        string,
        unknown
      >;
      await gchat.ingestGoogleEvent(payload);
      message.ack();
    } catch (err) {
      console.error("[gchat] process failed", err);
      message.nack();
    }
  };

  subscription.on("message", handler);
  subscription.on("error", (err) => {
    console.error("[gchat] subscription error", err);
  });

  return {
    async close() {
      await subscription.close();
    },
  };
}
