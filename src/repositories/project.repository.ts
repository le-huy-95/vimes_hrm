import type { Prisma, ProjectStatus } from "@prisma/client";
import { BaseRepository } from "./base.repository.js";

export class ProjectRepository extends BaseRepository {
  findManyByTeam(teamId: string) {
    return this.db.project.findMany({ where: { teamId }, orderBy: { createdAt: "desc" } });
  }
  findById(id: string) {
    return this.db.project.findUnique({ where: { id } });
  }
  create(data: Prisma.ProjectCreateInput) {
    return this.db.project.create({ data });
  }
  update(id: string, data: Prisma.ProjectUpdateInput) {
    return this.db.project.update({ where: { id }, data });
  }
  delete(id: string) {
    return this.db.project.delete({ where: { id } });
  }
  updateStatus(id: string, status: ProjectStatus) {
    return this.db.project.update({ where: { id }, data: { status } });
  }
}
