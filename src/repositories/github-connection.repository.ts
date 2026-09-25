import type { GithubAccountType, Prisma } from "@prisma/client";
import { BaseRepository } from "./base.repository.js";

export type GithubConnectionUpsert = {
  teamId: string;
  orgId: string;
  installationId: bigint;
  githubAccountLogin: string;
  githubAccountType: GithubAccountType;
  githubTeamId?: bigint | null;
  connectedByUserId?: string | null;
};

export class GithubConnectionRepository extends BaseRepository {
  findByTeamId(teamId: string) {
    return this.db.githubConnection.findUnique({ where: { teamId } });
  }

  findByInstallationId(installationId: bigint) {
    return this.db.githubConnection.findFirst({ where: { installationId } });
  }

  upsertForTeam(input: GithubConnectionUpsert) {
    return this.db.githubConnection.upsert({
      where: { teamId: input.teamId },
      create: {
        teamId: input.teamId,
        orgId: input.orgId,
        installationId: input.installationId,
        githubAccountLogin: input.githubAccountLogin,
        githubAccountType: input.githubAccountType,
        githubTeamId: input.githubTeamId ?? null,
        connectedByUserId: input.connectedByUserId ?? null,
      },
      update: {
        org: { connect: { id: input.orgId } },
        installationId: input.installationId,
        githubAccountLogin: input.githubAccountLogin,
        githubAccountType: input.githubAccountType,
        githubTeamId: input.githubTeamId ?? null,
        ...(input.connectedByUserId === undefined
          ? {}
          : input.connectedByUserId === null
            ? { connectedBy: { disconnect: true } }
            : { connectedBy: { connect: { id: input.connectedByUserId } } }),
      } satisfies Prisma.GithubConnectionUpdateInput,
    });
  }

  deleteByTeamId(teamId: string) {
    return this.db.githubConnection.deleteMany({ where: { teamId } });
  }

  deleteByInstallationId(installationId: bigint) {
    return this.db.githubConnection.deleteMany({ where: { installationId } });
  }
}
