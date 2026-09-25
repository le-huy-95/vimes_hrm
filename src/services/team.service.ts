/**
 * TeamService — nghiệp vụ team & thành viên trong một organization.
 *
 * buildTree là domain logic (không phải persistence) nên nằm ở Service.
 * Mọi thay đổi quan trọng ghi AuditRepository để truy vết.
 */
import { TeamRole } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import type { TeamRepository } from "../repositories/team.repository.js";
import type { UserRepository } from "../repositories/user.repository.js";
import type { AuditRepository } from "../repositories/audit.repository.js";

/** Node trong cây team (parent → children) */
export type TeamNode = {
  id: string;
  orgId: string;
  parentTeamId: string | null;
  name: string;
  description: string | null;
  createdAt: Date;
  children: TeamNode[];
};

export class TeamService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly teams: TeamRepository,
    private readonly users: UserRepository,
    private readonly audit: AuditRepository,
  ) {}

  async listTeams(orgId: string, asTree: boolean) {
    const teams = await this.teams.findManyByOrg(orgId);
    if (!asTree) return teams;
    return this.buildTree(teams);
  }

  /** Ghép danh sách phẳng thành cây theo parentTeamId */
  private buildTree(
    teams: Array<{
      id: string;
      orgId: string;
      parentTeamId: string | null;
      name: string;
      description: string | null;
      createdAt: Date;
    }>,
  ): TeamNode[] {
    const map = new Map<string, TeamNode>();
    for (const t of teams) {
      map.set(t.id, { ...t, children: [] });
    }
    const roots: TeamNode[] = [];
    for (const node of map.values()) {
      if (node.parentTeamId && map.has(node.parentTeamId)) {
        map.get(node.parentTeamId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  /**
   * Tạo team + gắn creator làm lead trong 1 transaction.
   * Parent (nếu có) phải thuộc cùng org.
   */
  async createTeam(
    actorUserId: string,
    orgId: string,
    input: { name: string; description?: string; parentTeamId?: string },
  ) {
    if (input.parentTeamId) {
      const parent = await this.teams.findById(input.parentTeamId);
      if (!parent || parent.orgId !== orgId) {
        throw new AppError(400, "Invalid parent team");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const teams = this.teams.withTx(tx);
      const audit = this.audit.withTx(tx);
      const team = await teams.create({
        orgId,
        name: input.name,
        description: input.description,
        parentTeamId: input.parentTeamId,
      });
      await teams.createMemberBasic({
        teamId: team.id,
        userId: actorUserId,
        role: TeamRole.lead,
      });
      await audit.create({
        actorUserId,
        action: "team.create",
        entityType: "team",
        entityId: team.id,
        meta: { name: team.name },
      });
      return team;
    });
  }

  async getTeam(orgId: string, teamId: string) {
    const team = await this.teams.findById(teamId);
    if (!team || team.orgId !== orgId) {
      throw new AppError(404, "Team not found");
    }
    return team;
  }

  async updateTeam(
    actorUserId: string,
    orgId: string,
    teamId: string,
    input: { name?: string; description?: string | null },
  ) {
    await this.getTeam(orgId, teamId);
    const team = await this.teams.update(teamId, input);
    await this.audit.create({
      actorUserId,
      action: "team.update",
      entityType: "team",
      entityId: teamId,
      meta: input,
    });
    return team;
  }

  /** Xóa team — chặn nếu còn team con (tránh orphan tree) */
  async deleteTeam(actorUserId: string, orgId: string, teamId: string) {
    await this.getTeam(orgId, teamId);
    const childCount = await this.teams.countChildren(teamId);
    if (childCount > 0) {
      throw new AppError(
        409,
        "Cannot delete team with child teams",
        "HAS_CHILDREN",
      );
    }
    await this.teams.delete(teamId);
    await this.audit.create({
      actorUserId,
      action: "team.delete",
      entityType: "team",
      entityId: teamId,
    });
  }

  async listMembers(orgId: string, teamId: string) {
    await this.getTeam(orgId, teamId);
    return this.teams.listMembers(teamId);
  }

  async addMember(
    actorUserId: string,
    orgId: string,
    teamId: string,
    input: { email: string; role: TeamRole },
  ) {
    await this.getTeam(orgId, teamId);
    const target = await this.users.findByEmail(input.email);
    if (!target || target.orgId !== orgId) {
      throw new AppError(404, "User not found in organization");
    }
    try {
      const member = await this.teams.createMember({
        teamId,
        userId: target.id,
        role: input.role,
      });
      await this.audit.create({
        actorUserId,
        action: "member.add",
        entityType: "team",
        entityId: teamId,
        meta: { userId: target.id, role: input.role },
      });
      return member;
    } catch {
      throw new AppError(409, "User is already a team member");
    }
  }

  async updateMemberRole(
    actorUserId: string,
    orgId: string,
    teamId: string,
    userId: string,
    role: TeamRole,
  ) {
    await this.getTeam(orgId, teamId);
    const member = await this.teams.findMember(teamId, userId);
    if (!member) throw new AppError(404, "Member not found");

    const updated = await this.teams.updateMemberRole(member.id, role);
    await this.audit.create({
      actorUserId,
      action: "member.role_update",
      entityType: "team",
      entityId: teamId,
      meta: { userId, role },
    });
    return updated;
  }

  /** Không cho xóa lead cuối cùng của team */
  async removeMember(
    actorUserId: string,
    orgId: string,
    teamId: string,
    userId: string,
  ) {
    await this.getTeam(orgId, teamId);
    const member = await this.teams.findMember(teamId, userId);
    if (!member) throw new AppError(404, "Member not found");

    if (member.role === TeamRole.lead) {
      const leadCount = await this.teams.countLeads(teamId);
      if (leadCount <= 1) {
        throw new AppError(409, "Cannot remove the last lead");
      }
    }

    await this.teams.deleteMember(member.id);
    await this.audit.create({
      actorUserId,
      action: "member.remove",
      entityType: "team",
      entityId: teamId,
      meta: { userId },
    });
  }
}
