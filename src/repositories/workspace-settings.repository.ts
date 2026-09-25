import type { Prisma } from "@prisma/client";
import { BaseRepository } from "./base.repository.js";

export type WorkspaceSyncStateUpdate = {
  directorySyncToken?: string | null;
  lastFullSyncAt?: Date | null;
  lastIncrementalSyncAt?: Date | null;
  syncCursorPageToken?: string | null;
  authMode?: Prisma.OrgWorkspaceSettingsUpdateInput["authMode"];
  workspaceOauthUserId?: string | null;
};

export class WorkspaceSettingsRepository extends BaseRepository {
  get(orgId: string) {
    return this.db.orgWorkspaceSettings.findUnique({ where: { orgId } });
  }

  async getOrCreate(orgId: string) {
    const existing = await this.db.orgWorkspaceSettings.findUnique({ where: { orgId } });
    if (existing) return existing;
    return this.db.orgWorkspaceSettings.create({ data: { orgId } });
  }

  upsert(orgId: string, data: Prisma.OrgWorkspaceSettingsUncheckedUpdateInput) {
    return this.db.orgWorkspaceSettings.upsert({
      where: { orgId },
      create: { ...(data as Prisma.OrgWorkspaceSettingsUncheckedCreateInput), orgId },
      update: data,
    });
  }

  updateSyncState(orgId: string, state: WorkspaceSyncStateUpdate) {
    return this.db.orgWorkspaceSettings.upsert({
      where: { orgId },
      create: { ...(state as Prisma.OrgWorkspaceSettingsUncheckedCreateInput), orgId },
      update: state as Prisma.OrgWorkspaceSettingsUpdateInput,
    });
  }
}
