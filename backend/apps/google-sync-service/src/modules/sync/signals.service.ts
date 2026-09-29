import { prismaWrite, Prisma } from "@manage-teams/db";
import { createLogger } from "@manage-teams/lib";

const logger = createLogger("google-sync-service");

export type GoogleSignal = {
  userId: string;
  taskId?: string;
  kind: "status" | "title" | "notes" | "deleted" | "detached" | "digest" | "created" | "due";
  changedFields: string[];
  payload?: Record<string, unknown>;
};

/**
 * Phase 2.5: ghi signal thay đổi từ Google (outbox stub — Kafka sau).
 */
export async function emitGoogleSignals(signals: GoogleSignal[]): Promise<number> {
  if (signals.length === 0) return 0;
  let n = 0;
  for (const s of signals) {
    const payload = {
      userId: s.userId,
      taskId: s.taskId ?? null,
      kind: s.kind,
      changedFields: s.changedFields,
      payload: s.payload ?? {},
      emittedAt: new Date().toISOString(),
    } as Prisma.InputJsonValue;
    await prismaWrite.outbox.create({
      data: {
        topic: "google.signals",
        payload,
      },
    });
    n += 1;
  }
  logger.info({ count: n, kinds: signals.map((x) => x.kind) }, "google.signals emitted");
  return n;
}
