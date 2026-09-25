import { BaseRepository } from "./base.repository.js";

export class WorkspaceGroupMapRepository extends BaseRepository {
  upsertMap(input: { orgId: string; googleGroupId: string; googleGroupEmail: string; teamId: string }) {
    return this.db.googleGroupTeamMap.upsert({
      where: { orgId_googleGroupId: { orgId: input.orgId, googleGroupId: input.googleGroupId } },
      create: input,
      update: { googleGroupEmail: input.googleGroupEmail, teamId: input.teamId },
    });
  }

  deleteByGroupEmail(orgId: string, groupEmail: string) {
    return this.db.googleGroupTeamMap.deleteMany({
      where: { orgId, googleGroupEmail: groupEmail },
    });
  }

  listByOrg(orgId: string) {
    return this.db.googleGroupTeamMap.findMany({
      where: { orgId },
      orderBy: { googleGroupEmail: "asc" },
    });
  }

  findByGroupEmail(orgId: string, groupEmail: string) {
    return this.db.googleGroupTeamMap.findFirst({
      where: { orgId, googleGroupEmail: groupEmail },
    });
  }
}
