import { Prisma } from "@prisma/client";
import { BaseRepository } from "./base.repository.js";

export type ActivityUpsert = {
  teamId: string;
  repoId?: string | null;
  eventType: string;
  action?: string | null;
  actorLogin?: string | null;
  title: string;
  externalUrl?: string | null;
  occurredAt: Date;
  dedupeKey: string;
  meta?: Prisma.InputJsonValue;
};

export class GithubActivityRepository extends BaseRepository {
  upsertByDedupeKey(input: ActivityUpsert) {
    return this.db.githubActivityEvent.upsert({
      where: { dedupeKey: input.dedupeKey },
      create: {
        teamId: input.teamId,
        repoId: input.repoId ?? null,
        eventType: input.eventType,
        action: input.action ?? null,
        actorLogin: input.actorLogin ?? null,
        title: input.title,
        externalUrl: input.externalUrl ?? null,
        occurredAt: input.occurredAt,
        dedupeKey: input.dedupeKey,
        meta: input.meta ?? Prisma.JsonNull,
      },
      update: {
        teamId: input.teamId,
        repoId: input.repoId ?? null,
        eventType: input.eventType,
        action: input.action ?? null,
        actorLogin: input.actorLogin ?? null,
        title: input.title,
        externalUrl: input.externalUrl ?? null,
        occurredAt: input.occurredAt,
        meta: input.meta ?? Prisma.JsonNull,
      },
    });
  }

  async listByTeamActor(
    teamId: string,
    actorLogin: string,
    take: number,
    cursor?: string,
  ) {
    const rows = await this.db.githubActivityEvent.findMany({
      where: {
        teamId,
        actorLogin,
        OR: [
          { eventType: "push" },
          { eventType: { contains: "commit" } },
        ],
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: take + 1,
      include: {
        repo: { select: { fullName: true, htmlUrl: true } },
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;
    return { items, nextCursor };
  }

  async listByTeam(teamId: string, take: number, cursor?: string) {
    const rows = await this.db.githubActivityEvent.findMany({
      where: { teamId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: take + 1,
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;
    return { items, nextCursor };
  }
}
