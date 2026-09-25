/**
 * IntegrationService — trạng thái liên kết Google/GitHub cho sidebar + panel thành viên.
 */
import { AppError } from "../lib/errors.js";
import type { PrismaClient } from "@prisma/client";
import type { TeamRepository } from "../repositories/team.repository.js";
import type { GithubConnectionRepository } from "../repositories/github-connection.repository.js";
import type { GithubActivityRepository } from "../repositories/github-activity.repository.js";
import type { WorkspaceSettingsRepository } from "../repositories/workspace-settings.repository.js";
import type { GchatRepository } from "../repositories/gchat.repository.js";

export class IntegrationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly teams: TeamRepository,
    private readonly githubConnections: GithubConnectionRepository,
    private readonly githubActivity: GithubActivityRepository,
    private readonly workspaceSettings: WorkspaceSettingsRepository,
    private readonly gchat: GchatRepository,
  ) {}

  private async assertTeam(orgId: string, teamId: string) {
    const team = await this.teams.findById(teamId);
    if (!team || team.orgId !== orgId) {
      throw new AppError(404, "Team not found");
    }
    return team;
  }

  async getIntegrations(orgId: string, teamId: string) {
    await this.assertTeam(orgId, teamId);

    const [members, connection, repoCount, spaces, settings, googleLinked] =
      await Promise.all([
        this.teams.listMembers(teamId),
        this.githubConnections.findByTeamId(teamId),
        this.prisma.githubRepo.count({ where: { teamId } }),
        this.gchat.listSpacesByTeam(teamId),
        this.workspaceSettings.get(orgId),
        this.prisma.teamMember.count({
          where: {
            teamId,
            user: { googleUserId: { not: null } },
          },
        }),
      ]);

    const githubLinked = members.filter((m) => m.githubLogin).length;

    return {
      google: {
        login: googleLinked > 0,
        tasks: false,
        workspace: Boolean(
          settings &&
            (settings.lastFullSyncAt ||
              settings.lastIncrementalSyncAt ||
              settings.authMode !== "none"),
        ),
        gchat: spaces.length > 0,
      },
      github: {
        app: Boolean(connection),
        repos: repoCount > 0,
      },
      summary: {
        memberTotal: members.length,
        googleLinked,
        githubLinked,
        repoCount,
      },
    };
  }

  async listMemberIntegrations(
    orgId: string,
    teamId: string,
    service: "google" | "github",
  ) {
    await this.assertTeam(orgId, teamId);
    const members = await this.teams.listMembers(teamId);

    return members.map((m) => {
      if (service === "google") {
        const linked = Boolean(m.user.googleUserId);
        return {
          userId: m.userId,
          fullName: m.user.fullName,
          email: m.user.email,
          role: m.role,
          linked,
          handle: linked ? m.user.email : null,
        };
      }
      const login = m.githubLogin;
      return {
        userId: m.userId,
        fullName: m.user.fullName,
        email: m.user.email,
        role: m.role,
        linked: Boolean(login),
        handle: login ? `@${login}` : null,
        githubLogin: login,
      };
    });
  }

  async listGithubCommits(
    orgId: string,
    teamId: string,
    userId: string,
    opts: { cursor?: string; take?: number } = {},
  ) {
    await this.assertTeam(orgId, teamId);
    const member = await this.teams.findMember(teamId, userId);
    if (!member) throw new AppError(404, "Member not found");
    if (!member.githubLogin) {
      throw new AppError(409, "Member has no GitHub login linked", "NOT_LINKED");
    }

    const take = Math.min(opts.take ?? 20, 50);
    const page = await this.githubActivity.listByTeamActor(
      teamId,
      member.githubLogin,
      take,
      opts.cursor,
    );

    return {
      userId,
      githubLogin: member.githubLogin,
      items: page.items.map((e) => ({
        id: e.id,
        title: e.title,
        eventType: e.eventType,
        action: e.action,
        occurredAt: e.occurredAt,
        externalUrl: e.externalUrl,
        repoFullName: e.repo?.fullName ?? null,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
