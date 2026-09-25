import { BaseRepository } from "./base.repository.js";
import type { Prisma } from "@prisma/client";

export class GchatRepository extends BaseRepository {
  upsertSpace(input: {
    teamId: string;
    googleSpaceId: string;
    displayName: string;
    subscriptionId?: string | null;
    subscriptionExpireTime?: Date | null;
  }) {
    return this.db.gchatSpace.upsert({
      where: { googleSpaceId: input.googleSpaceId },
      create: {
        teamId: input.teamId,
        googleSpaceId: input.googleSpaceId,
        displayName: input.displayName,
        subscriptionId: input.subscriptionId ?? null,
        subscriptionExpireTime: input.subscriptionExpireTime ?? null,
      },
      update: {
        displayName: input.displayName,
        subscriptionId: input.subscriptionId ?? undefined,
        subscriptionExpireTime: input.subscriptionExpireTime ?? undefined,
        syncStatus: "active",
      },
    });
  }

  listSpacesByTeam(teamId: string) {
    return this.db.gchatSpace.findMany({
      where: { teamId },
      orderBy: { createdAt: "asc" },
    });
  }

  findSpaceByGoogleId(googleSpaceId: string) {
    return this.db.gchatSpace.findUnique({ where: { googleSpaceId } });
  }

  findSpaceById(id: string) {
    return this.db.gchatSpace.findUnique({ where: { id } });
  }

  /** Returns created row, or existing if duplicate google_message_id. */
  async insertMessageIdempotent(data: {
    gchatSpaceId: string;
    googleMessageId: string;
    senderGoogleId?: string | null;
    senderUserId?: string | null;
    textContent: string;
    threadId?: string | null;
    source: "google" | "app";
    syncStatus: "pending" | "sent" | "confirmed" | "failed";
    createdTime: Date;
    rawPayload?: Prisma.InputJsonValue;
  }) {
    try {
      return {
        created: true as const,
        row: await this.db.gchatMessage.create({ data }),
      };
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as { code: string }).code
          : "";
      if (code === "P2002") {
        const existing = await this.db.gchatMessage.findUnique({
          where: { googleMessageId: data.googleMessageId },
        });
        return { created: false as const, row: existing };
      }
      throw err;
    }
  }

  markMessageConfirmed(googleMessageId: string) {
    return this.db.gchatMessage.update({
      where: { googleMessageId },
      data: { syncStatus: "confirmed", updatedTime: new Date() },
    });
  }

  touchHealth(gchatSpaceId: string, patch: {
    lastEventReceivedAt?: Date;
    lastRenewAt?: Date;
    status?: string;
    errorMessage?: string | null;
  }) {
    return this.db.gchatSubscriptionHealth.upsert({
      where: { gchatSpaceId },
      create: {
        gchatSpaceId,
        status: patch.status ?? "ok",
        lastEventReceivedAt: patch.lastEventReceivedAt ?? null,
        lastRenewAt: patch.lastRenewAt ?? null,
        errorMessage: patch.errorMessage ?? null,
      },
      update: {
        status: patch.status,
        lastEventReceivedAt: patch.lastEventReceivedAt,
        lastRenewAt: patch.lastRenewAt,
        errorMessage: patch.errorMessage,
      },
    });
  }

  listStaleHealth(before: Date) {
    return this.db.gchatSubscriptionHealth.findMany({
      where: {
        OR: [
          { lastEventReceivedAt: { lt: before } },
          { lastEventReceivedAt: null },
        ],
      },
      include: { space: true },
    });
  }

  listSpacesNeedingRenew(before: Date) {
    return this.db.gchatSpace.findMany({
      where: {
        OR: [
          { subscriptionExpireTime: { lte: before } },
          { subscriptionExpireTime: null },
        ],
        syncStatus: "active",
      },
    });
  }
}
