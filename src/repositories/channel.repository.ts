import { BaseRepository } from "./base.repository.js";

export class ChannelRepository extends BaseRepository {
  findById(id: string) {
    return this.db.channel.findUnique({ where: { id } });
  }

  findTeamChannel(teamId: string) {
    return this.db.channel.findUnique({
      where: { teamId_type: { teamId, type: "team" } },
    });
  }

  ensureTeamChannel(teamId: string) {
    return this.db.channel.upsert({
      where: { teamId_type: { teamId, type: "team" } },
      create: { teamId, name: "general", type: "team" },
      update: {},
    });
  }

  listByTeam(teamId: string) {
    return this.db.channel.findMany({
      where: { teamId },
      orderBy: { createdAt: "asc" },
    });
  }
}
