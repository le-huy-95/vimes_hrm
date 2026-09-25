import type { PrismaClient, ProjectStatus } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import type { ProjectRepository } from "../repositories/project.repository.js";
import type { TeamRepository } from "../repositories/team.repository.js";
import type { AuditRepository } from "../repositories/audit.repository.js";

export class ProjectService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly projects: ProjectRepository,
    private readonly teams: TeamRepository,
    private readonly audit: AuditRepository,
  ) {}

  private async assertTeam(orgId: string, teamId: string) {
    const team = await this.teams.findById(teamId);
    if (!team || team.orgId !== orgId) {
      throw new AppError(404, "Team not found");
    }
    return team;
  }

  private async getProjectInTeam(teamId: string, projectId: string) {
    const project = await this.projects.findById(projectId);
    if (!project || project.teamId !== teamId) {
      throw new AppError(404, "Project not found");
    }
    return project;
  }

  async listProjects(orgId: string, teamId: string) {
    await this.assertTeam(orgId, teamId);
    return this.projects.findManyByTeam(teamId);
  }

  async createProject(
    actorUserId: string,
    orgId: string,
    teamId: string,
    input: { name: string },
  ) {
    await this.assertTeam(orgId, teamId);
    const project = await this.projects.create({
      name: input.name,
      team: { connect: { id: teamId } },
    });
    await this.audit.create({
      actorUserId,
      action: "project.create",
      entityType: "project",
      entityId: project.id,
      meta: { name: project.name },
    });
    return project;
  }

  async getProject(orgId: string, teamId: string, projectId: string) {
    await this.assertTeam(orgId, teamId);
    return this.getProjectInTeam(teamId, projectId);
  }

  async updateProject(
    actorUserId: string,
    orgId: string,
    teamId: string,
    projectId: string,
    input: { name?: string; status?: ProjectStatus },
  ) {
    await this.assertTeam(orgId, teamId);
    await this.getProjectInTeam(teamId, projectId);
    const project = await this.projects.update(projectId, input);
    await this.audit.create({
      actorUserId,
      action: "project.update",
      entityType: "project",
      entityId: projectId,
      meta: input,
    });
    return project;
  }

  async deleteProject(
    actorUserId: string,
    orgId: string,
    teamId: string,
    projectId: string,
  ) {
    await this.assertTeam(orgId, teamId);
    await this.getProjectInTeam(teamId, projectId);
    await this.projects.delete(projectId);
    await this.audit.create({
      actorUserId,
      action: "project.delete",
      entityType: "project",
      entityId: projectId,
    });
  }
}
