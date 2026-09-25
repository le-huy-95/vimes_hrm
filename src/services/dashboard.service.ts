import { redis } from "../lib/redis.js";
import { AppError } from "../lib/errors.js";
import type { PrismaClient } from "@prisma/client";
import type { TeamRepository } from "../repositories/team.repository.js";
import type { ChannelRepository } from "../repositories/channel.repository.js";
import type { GithubConnectionRepository } from "../repositories/github-connection.repository.js";

const CACHE_TTL_SEC = 60;
const RECENT_N = 10;

function cacheKey(teamId: string) {
  return `team:${teamId}:dashboard`;
}

export class DashboardService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly teams: TeamRepository,
    private readonly channels: ChannelRepository,
    private readonly githubConnections: GithubConnectionRepository,
  ) {}

  async getDashboard(
    teamId: string,
    orgId: string,
    opts: { refresh?: boolean } = {},
  ) {
    const team = await this.teams.findById(teamId);
    if (!team || team.orgId !== orgId) throw new AppError(404, "Team not found");

    if (!opts.refresh) {
      const cached = await redis.get(cacheKey(teamId));
      if (cached) {
        return { ...JSON.parse(cached), cached: true };
      }
    }

    const channel = await this.channels.ensureTeamChannel(teamId);

    const [members, taskGroups, connection, repoCount, recentActivity, recentMessages] =
      await Promise.all([
        this.prisma.teamMember.groupBy({
          by: ["role"],
          where: { teamId },
          _count: { _all: true },
        }),
        this.prisma.task.groupBy({
          by: ["status"],
          where: { project: { teamId } },
          _count: { _all: true },
        }),
        this.githubConnections.findByTeamId(teamId),
        this.prisma.githubRepo.count({ where: { teamId } }),
        this.prisma.githubActivityEvent.findMany({
          where: { teamId },
          orderBy: { occurredAt: "desc" },
          take: RECENT_N,
          select: {
            id: true,
            eventType: true,
            action: true,
            actorLogin: true,
            title: true,
            externalUrl: true,
            occurredAt: true,
          },
        }),
        this.prisma.message.findMany({
          where: { channelId: channel.id },
          orderBy: { createdAt: "desc" },
          take: RECENT_N,
          include: {
            sender: { select: { id: true, email: true, fullName: true } },
          },
        }),
      ]);

    const byRole = { lead: 0, member: 0, viewer: 0 };
    let total = 0;
    for (const row of members) {
      const n = row._count._all;
      total += n;
      if (row.role in byRole) {
        byRole[row.role as keyof typeof byRole] = n;
      }
    }

    const tasks = {
      todo: 0,
      in_progress: 0,
      done: 0,
      cancelled: 0,
    };
    for (const row of taskGroups) {
      if (row.status in tasks) {
        tasks[row.status as keyof typeof tasks] = row._count._all;
      }
    }

    const payload = {
      teamId,
      members: { total, byRole },
      tasks,
      github: {
        connected: Boolean(connection),
        repoCount,
        recentActivity,
      },
      chat: {
        channelId: channel.id,
        recentMessages: recentMessages.reverse(),
      },
      cached: false,
    };

    await redis.set(cacheKey(teamId), JSON.stringify({ ...payload, cached: false }), "EX", CACHE_TTL_SEC);
    return payload;
  }
}
