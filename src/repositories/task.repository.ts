import type { Prisma, TaskStatus } from "@prisma/client";
import { BaseRepository } from "./base.repository.js";

const commentUserInclude = {
  user: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.TaskCommentInclude;

export class TaskRepository extends BaseRepository {
  findManyByProject(projectId: string) {
    return this.db.task.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
  }
  findById(id: string) {
    return this.db.task.findUnique({ where: { id }, include: { project: true } });
  }
  findByIdBasic(id: string) {
    return this.db.task.findUnique({ where: { id } });
  }
  create(data: Prisma.TaskCreateInput) {
    return this.db.task.create({ data });
  }
  update(id: string, data: Prisma.TaskUpdateInput) {
    return this.db.task.update({ where: { id }, data });
  }
  delete(id: string) {
    return this.db.task.delete({ where: { id } });
  }
  updateGithubLink(id: string, data: { githubIssueUrl: string; status?: TaskStatus }) {
    return this.db.task.update({ where: { id }, data });
  }
  listComments(taskId: string) {
    return this.db.taskComment.findMany({
      where: { taskId },
      include: commentUserInclude,
      orderBy: { createdAt: "asc" },
    });
  }
  createComment(data: Prisma.TaskCommentCreateInput) {
    return this.db.taskComment.create({ data, include: commentUserInclude });
  }
  findCommentById(id: string) {
    return this.db.taskComment.findUnique({ where: { id } });
  }
  deleteComment(id: string) {
    return this.db.taskComment.delete({ where: { id } });
  }
}
