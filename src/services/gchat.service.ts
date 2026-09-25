import { AppError } from "../lib/errors.js";
import { env, gchatEnabled } from "../lib/env.js";
import type { GchatRepository } from "../repositories/gchat.repository.js";
import type { TeamRepository } from "../repositories/team.repository.js";
import { randomUUID } from "node:crypto";

/**
 * Google Chat Bot integration (Phases 8–10).
 * When GCHAT_ENABLED is false, connect/send return 503; Pub/Sub worker is not started.
 */
export class GchatService {
  constructor(
    private readonly gchat: GchatRepository,
    private readonly teams: TeamRepository,
  ) {}

  assertEnabled() {
    if (!gchatEnabled) {
      throw new AppError(
        503,
        "Google Chat integration is disabled (set GCHAT_ENABLED=true + subscription + SA)",
      );
    }
  }

  async listSpaces(teamId: string, orgId: string) {
    const team = await this.teams.findById(teamId);
    if (!team || team.orgId !== orgId) throw new AppError(404, "Team not found");
    return this.gchat.listSpacesByTeam(teamId);
  }

  /** Register / upsert a Google Chat space linked to a team (admin maps manually). */
  async connectSpace(input: {
    teamId: string;
    orgId: string;
    googleSpaceId: string;
    displayName: string;
  }) {
    this.assertEnabled();
    const team = await this.teams.findById(input.teamId);
    if (!team || team.orgId !== input.orgId) throw new AppError(404, "Team not found");
    const space = await this.gchat.upsertSpace({
      teamId: input.teamId,
      googleSpaceId: input.googleSpaceId,
      displayName: input.displayName,
    });
    await this.gchat.touchHealth(space.id, { status: "ok" });
    return space;
  }

  /**
   * Outbound: persist pending message with synthetic google id until Bot API returns real id.
   * Real Chat API call is gated — without credentials we store pending only for local testing.
   */
  async sendFromApp(input: {
    teamId: string;
    orgId: string;
    spaceId: string;
    userId: string;
    text: string;
  }) {
    this.assertEnabled();
    const team = await this.teams.findById(input.teamId);
    if (!team || team.orgId !== input.orgId) throw new AppError(404, "Team not found");
    const space = await this.gchat.findSpaceById(input.spaceId);
    if (!space || space.teamId !== input.teamId) {
      throw new AppError(404, "GChat space not found");
    }

    const provisionalId = `app-pending:${randomUUID()}`;
    const { row } = await this.gchat.insertMessageIdempotent({
      gchatSpaceId: space.id,
      googleMessageId: provisionalId,
      senderUserId: input.userId,
      textContent: input.text,
      source: "app",
      syncStatus: "pending",
      createdTime: new Date(),
    });

    // Placeholder for googleapis chat.spaces.messages.create — mark sent when API configured.
    const sa =
      env.GCHAT_SERVICE_ACCOUNT_JSON?.trim() ||
      env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
    if (sa && row) {
      // Real send would replace provisionalId with Google's name; for scaffold we mark sent.
      await this.gchat.markMessageConfirmed(provisionalId).catch(() => undefined);
      return { ...row, syncStatus: "sent" as const, note: "bot_send_stub" };
    }
    return row;
  }

  /** Inbound Pub/Sub event processor — idempotent on google_message_id. */
  async ingestGoogleEvent(payload: Record<string, unknown>) {
    const message = (payload.message ?? payload) as Record<string, unknown>;
    const name = String(message.name ?? message.messageId ?? "");
    const spaceName = String(
      (message.space as { name?: string } | undefined)?.name ??
        payload.spaceName ??
        "",
    );
    const text =
      String(
        (message.text as string | undefined) ??
          (message.argumentText as string | undefined) ??
          "",
      ) || "(empty)";
    if (!name || !spaceName) {
      return { ignored: true as const, reason: "missing_ids" };
    }

    const space = await this.gchat.findSpaceByGoogleId(spaceName);
    if (!space) {
      return { ignored: true as const, reason: "unknown_space" };
    }

    const existing = await this.gchat.insertMessageIdempotent({
      gchatSpaceId: space.id,
      googleMessageId: name,
      senderGoogleId: String(
        (message.sender as { name?: string } | undefined)?.name ?? "",
      ) || null,
      textContent: text,
      threadId: String(
        (message.thread as { name?: string } | undefined)?.name ?? "",
      ) || null,
      source: "google",
      syncStatus: "confirmed",
      createdTime: new Date(
        String(message.createTime ?? message.create_time ?? Date.now()),
      ),
      rawPayload: payload as object,
    });

    await this.gchat.touchHealth(space.id, {
      lastEventReceivedAt: new Date(),
      status: "ok",
    });

    // Echo of our own outbound → confirm only, no duplicate emit semantics
    if (!existing.created && existing.row?.source === "app") {
      await this.gchat.markMessageConfirmed(name).catch(async () => {
        if (existing.row) {
          await this.gchat.markMessageConfirmed(existing.row.googleMessageId);
        }
      });
      return { duplicate: true as const, confirmed: true as const };
    }

    return { created: existing.created, message: existing.row };
  }

  async renewSubscriptions() {
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const spaces = await this.gchat.listSpacesNeedingRenew(soon);
    for (const s of spaces) {
      // Real renew would call Workspace Events API; scaffold touches health.
      await this.gchat.touchHealth(s.id, {
        lastRenewAt: new Date(),
        status: "ok",
      });
    }
    return { renewed: spaces.length };
  }

  async checkStaleSubscriptions() {
    const before = new Date(
      Date.now() - env.GCHAT_STALE_HOURS * 60 * 60 * 1000,
    );
    const stale = await this.gchat.listStaleHealth(before);
    for (const h of stale) {
      console.warn(
        "[gchat] stale subscription",
        h.gchatSpaceId,
        h.space.googleSpaceId,
      );
      await this.gchat.touchHealth(h.gchatSpaceId, {
        status: "stale",
        errorMessage: `No events for >${env.GCHAT_STALE_HOURS}h`,
      });
    }
    return { stale: stale.length };
  }
}
