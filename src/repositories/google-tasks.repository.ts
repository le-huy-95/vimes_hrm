import type { GoogleTasksListKind, Prisma } from "@prisma/client";
import { BaseRepository } from "./base.repository.js";

export class GoogleTasksRepository extends BaseRepository {
  getSettings(teamId: string) {
    return this.db.teamGoogleTasksSettings.findUnique({ where: { teamId } });
  }

  upsertSettings(input: {
    teamId: string;
    todoListId?: string | null;
    doingListId?: string | null;
    doneListId?: string | null;
    connectedByUserId?: string | null;
    lastSyncedAt?: Date | null;
  }) {
    return this.db.teamGoogleTasksSettings.upsert({
      where: { teamId: input.teamId },
      create: {
        teamId: input.teamId,
        todoListId: input.todoListId ?? null,
        doingListId: input.doingListId ?? null,
        doneListId: input.doneListId ?? null,
        connectedByUserId: input.connectedByUserId ?? null,
        lastSyncedAt: input.lastSyncedAt ?? null,
      },
      update: {
        ...(input.todoListId !== undefined
          ? { todoListId: input.todoListId }
          : {}),
        ...(input.doingListId !== undefined
          ? { doingListId: input.doingListId }
          : {}),
        ...(input.doneListId !== undefined
          ? { doneListId: input.doneListId }
          : {}),
        ...(input.connectedByUserId !== undefined
          ? { connectedByUserId: input.connectedByUserId }
          : {}),
        ...(input.lastSyncedAt !== undefined
          ? { lastSyncedAt: input.lastSyncedAt }
          : {}),
      },
    });
  }

  deleteTasksForTeam(teamId: string) {
    return this.db.googleTask.deleteMany({ where: { teamId } });
  }

  upsertTask(input: {
    teamId: string;
    googleTaskId: string;
    listKind: GoogleTasksListKind;
    title: string;
    status: string;
    googleUpdatedAt?: Date | null;
  }) {
    return this.db.googleTask.upsert({
      where: {
        teamId_googleTaskId: {
          teamId: input.teamId,
          googleTaskId: input.googleTaskId,
        },
      },
      create: input,
      update: {
        listKind: input.listKind,
        title: input.title,
        status: input.status,
        googleUpdatedAt: input.googleUpdatedAt ?? null,
      } satisfies Prisma.GoogleTaskUpdateInput,
    });
  }

  countByKind(teamId: string) {
    return this.db.googleTask.groupBy({
      by: ["listKind"],
      where: { teamId },
      _count: { _all: true },
    });
  }
}
