/**
 * TeamRepository — teams, team_members, và lookup role_permission (cho RBAC).
 */
import type { Prisma, TeamRole } from "@prisma/client";
import { BaseRepository } from "./base.repository.js";

const memberUserInclude = {
  user: {
    select: { id: true, email: true, fullName: true, status: true },
  },
} satisfies Prisma.TeamMemberInclude;

export class TeamRepository extends BaseRepository {
  findManyByOrg(orgId: string) {
    return this.db.team.findMany({
      where: { orgId },
      orderBy: { name: "asc" },
    });
  }

  findById(teamId: string) {
    return this.db.team.findUnique({ where: { id: teamId } });
  }

  create(data: {
    orgId: string;
    name: string;
    description?: string;
    parentTeamId?: string;
  }) {
    return this.db.team.create({ data });
  }

  update(
    teamId: string,
    data: { name?: string; description?: string | null },
  ) {
    return this.db.team.update({
      where: { id: teamId },
      data,
    });
  }

  delete(teamId: string) {
    return this.db.team.delete({ where: { id: teamId } });
  }

  countChildren(parentTeamId: string) {
    return this.db.team.count({ where: { parentTeamId } });
  }

  findMember(teamId: string, userId: string) {
    return this.db.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
  }

  listMembers(teamId: string) {
    return this.db.teamMember.findMany({
      where: { teamId },
      include: memberUserInclude,
      orderBy: { joinedAt: "asc" },
    });
  }

  createMember(data: { teamId: string; userId: string; role: TeamRole }) {
    return this.db.teamMember.create({
      data,
      include: memberUserInclude,
    });
  }

  createMemberBasic(data: {
    teamId: string;
    userId: string;
    role: TeamRole;
  }) {
    return this.db.teamMember.create({ data });
  }

  updateMemberRole(memberId: string, role: TeamRole) {
    return this.db.teamMember.update({
      where: { id: memberId },
      data: { role },
      include: memberUserInclude,
    });
  }

  deleteMember(memberId: string) {
    return this.db.teamMember.delete({ where: { id: memberId } });
  }

  countLeads(teamId: string) {
    return this.db.teamMember.count({
      where: { teamId, role: "lead" },
    });
  }

  findRolePermission(roleName: string, permissionKey: string) {
    return this.db.rolePermission.findUnique({
      where: {
        roleName_permissionKey: { roleName, permissionKey },
      },
    });
  }
}
