import type { PrismaClient, TaskPriority, TaskStatus } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import type { ProjectRepository } from "../repositories/project.repository.js";
import type { TaskRepository } from "../repositories/task.repository.js";
import type { TeamRepository } from "../repositories/team.repository.js";
import type { AuditRepository } from "../repositories/audit.repository.js";

export class TaskService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tasks: TaskRepository,
    private readonly projects: ProjectRepository,
    private readonly teams: TeamRepository,
    private readonly audit: AuditRepository,
  ) {}

  private async assertProjectInTeam(teamId: string, projectId: string) {
    const project = await this.projects.findById(projectId);
    if (!project || project.teamId !== teamId) {
      throw new AppError(404, "Project not found");
    }
    return project;
  }

  private async getTaskInTeam(teamId: string, taskId: string) {
    const task = await this.tasks.findById(taskId);
    if (!task || task.project.teamId !== teamId) {
      throw new AppError(404, "Task not found");
    }
    return task;
  }

  private async assertAssignee(teamId: string, assigneeId?: string | null) {
    if (!assigneeId) return;
    const member = await this.teams.findMember(teamId, assigneeId);
    if (!member) {
      throw new AppError(400, "Assignee must be a team member");
    }
  }

  async listTasks(orgId: string, teamId: string, projectId: string) {
    await this.assertProjectInTeam(teamId, projectId);
    return this.tasks.findManyByProject(projectId);
  }

  async createTask(
    actorUserId: string,
    orgId: string,
    teamId: string,
    projectId: string,
    input: {
      title: string;
      description?: string;
      assigneeId?: string;
      priority: TaskPriority;
      status: TaskStatus;
      dueDate?: string;
      githubIssueUrl?: string;
    },
  ) {
    await this.assertProjectInTeam(teamId, projectId);
    await this.assertAssignee(teamId, input.assigneeId);
    const task = await this.tasks.create({
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: input.status,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      githubIssueUrl: input.githubIssueUrl,
      project: { connect: { id: projectId } },
      ...(input.assigneeId ? { assignee: { connect: { id: input.assigneeId } } } : {}),
    });
    await this.audit.create({
      actorUserId,
      action: "task.create",
      entityType: "task",
      entityId: task.id,
      meta: { projectId },
    });
    return task;
  }

  async getTask(orgId: string, teamId: string, taskId: string) {
    return this.getTaskInTeam(teamId, taskId);
  }

  async updateTask(
    actorUserId: string,
    orgId: string,
    teamId: string,
    taskId: string,
    input: {
      title?: string;
      description?: string | null;
      assigneeId?: string | null;
      priority?: TaskPriority;
      status?: TaskStatus;
      dueDate?: string | null;
      githubIssueUrl?: string | null;
    },
  ) {
    await this.getTaskInTeam(teamId, taskId);
    await this.assertAssignee(teamId, input.assigneeId);
    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.status !== undefined) data.status = input.status;
    if (input.githubIssueUrl !== undefined) data.githubIssueUrl = input.githubIssueUrl;
    if (input.dueDate !== undefined) {
      data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    }
    if (input.assigneeId !== undefined) {
      data.assignee = input.assigneeId
        ? { connect: { id: input.assigneeId } }
        : { disconnect: true };
    }
    const task = await this.tasks.update(taskId, data);
    await this.audit.create({
      actorUserId,
      action: "task.update",
      entityType: "task",
      entityId: taskId,
      meta: { fields: Object.keys(data) },
    });
    return task;
  }

  async deleteTask(actorUserId: string, orgId: string, teamId: string, taskId: string) {
    await this.getTaskInTeam(teamId, taskId);
    await this.tasks.delete(taskId);
    await this.audit.create({
      actorUserId,
      action: "task.delete",
      entityType: "task",
      entityId: taskId,
    });
  }

  async listComments(orgId: string, teamId: string, taskId: string) {
    await this.getTaskInTeam(teamId, taskId);
    return this.tasks.listComments(taskId);
  }

  async addComment(
    actorUserId: string,
    orgId: string,
    teamId: string,
    taskId: string,
    content: string,
  ) {
    await this.getTaskInTeam(teamId, taskId);
    return this.tasks.createComment({
      content,
      task: { connect: { id: taskId } },
      user: { connect: { id: actorUserId } },
    });
  }

  async deleteComment(
    actorUserId: string,
    orgId: string,
    teamId: string,
    taskId: string,
    commentId: string,
    isManager: boolean,
  ) {
    await this.getTaskInTeam(teamId, taskId);
    const comment = await this.tasks.findCommentById(commentId);
    if (!comment || comment.taskId !== taskId) {
      throw new AppError(404, "Comment not found");
    }
    if (comment.userId !== actorUserId && !isManager) {
      throw new AppError(403, "Not allowed to delete this comment");
    }
    await this.tasks.deleteComment(commentId);
  }
}
