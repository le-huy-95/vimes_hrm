/**
 * Team routes — JWT bắt buộc; các thao tác theo teamId kiểm tra RBAC.
 *
 * requireTeamPermission("team:view") đọc role của user trong team
 * rồi đối chiếu bảng roles_permissions.
 */
import { Router } from "express";
import {
  chatController,
  dashboardController,
  fileController,
  gchatController,
  githubTeamController,
  integrationController,
  projectController,
  taskController,
  teamController,
} from "../container.js";
import { authenticateJWT } from "../middleware/auth.js";
import { requireTeamPermission } from "../middleware/rbac.js";
import { idempotency } from "../middleware/idempotency.js";

export const teamsRouter = Router();

// Public: GitHub redirects here without Authorization header
teamsRouter.get(
  "/github/install/callback",
  githubTeamController.installCallback,
);

teamsRouter.use(authenticateJWT);

teamsRouter.get("/", teamController.list);
teamsRouter.post("/", teamController.create);

teamsRouter.get(
  "/:teamId/dashboard",
  requireTeamPermission("team:view"),
  dashboardController.get,
);

teamsRouter.get(
  "/:teamId/integrations",
  requireTeamPermission("team:view"),
  integrationController.get,
);
teamsRouter.get(
  "/:teamId/members/integrations",
  requireTeamPermission("team:view"),
  integrationController.listMembers,
);
teamsRouter.get(
  "/:teamId/members/:userId/github-commits",
  requireTeamPermission("team:view"),
  integrationController.listCommits,
);

// Google Chat Bot (Phases 8–10)
teamsRouter.get(
  "/:teamId/gchat/spaces",
  requireTeamPermission("team:view"),
  gchatController.listSpaces,
);
teamsRouter.post(
  "/:teamId/gchat/spaces",
  requireTeamPermission("team:manage"),
  idempotency(),
  gchatController.connectSpace,
);
teamsRouter.post(
  "/:teamId/gchat/spaces/:spaceId/messages",
  requireTeamPermission("team:view"),
  idempotency(),
  gchatController.sendMessage,
);

// Chat
teamsRouter.get(
  "/:teamId/channels",
  requireTeamPermission("team:view"),
  chatController.listChannels,
);
teamsRouter.get(
  "/:teamId/channels/:channelId/messages",
  requireTeamPermission("team:view"),
  chatController.listMessages,
);
teamsRouter.post(
  "/:teamId/channels/:channelId/messages",
  requireTeamPermission("team:view"),
  idempotency(),
  chatController.createMessage,
);

// GitHub App connect (team-scoped, JWT + RBAC)
teamsRouter.get(
  "/:teamId/github/install-url",
  requireTeamPermission("team:manage"),
  githubTeamController.getInstallUrl,
);
teamsRouter.get(
  "/:teamId/github/connection",
  requireTeamPermission("team:view"),
  githubTeamController.getConnection,
);
teamsRouter.delete(
  "/:teamId/github/connection",
  requireTeamPermission("team:manage"),
  githubTeamController.deleteConnection,
);
teamsRouter.get(
  "/:teamId/github/repos",
  requireTeamPermission("team:view"),
  githubTeamController.listRepos,
);
teamsRouter.post(
  "/:teamId/github/sync",
  requireTeamPermission("team:manage"),
  githubTeamController.enqueueSync,
);
teamsRouter.get(
  "/:teamId/github/activity",
  requireTeamPermission("team:view"),
  githubTeamController.listActivity,
);

// Projects (team-scoped)
teamsRouter.get(
  "/:teamId/projects",
  requireTeamPermission("team:view"),
  projectController.list,
);
teamsRouter.post(
  "/:teamId/projects",
  requireTeamPermission("team:manage"),
  projectController.create,
);
teamsRouter.get(
  "/:teamId/projects/:projectId",
  requireTeamPermission("team:view"),
  projectController.getOne,
);
teamsRouter.patch(
  "/:teamId/projects/:projectId",
  requireTeamPermission("team:manage"),
  projectController.update,
);
teamsRouter.delete(
  "/:teamId/projects/:projectId",
  requireTeamPermission("team:manage"),
  projectController.remove,
);

// Tasks within a project
teamsRouter.get(
  "/:teamId/projects/:projectId/tasks",
  requireTeamPermission("team:view"),
  taskController.list,
);
teamsRouter.post(
  "/:teamId/projects/:projectId/tasks",
  requireTeamPermission("task:write"),
  taskController.create,
);

// Tasks (flat, team-scoped)
teamsRouter.get(
  "/:teamId/tasks/:taskId",
  requireTeamPermission("team:view"),
  taskController.getOne,
);
teamsRouter.patch(
  "/:teamId/tasks/:taskId",
  requireTeamPermission("task:write"),
  taskController.update,
);
teamsRouter.delete(
  "/:teamId/tasks/:taskId",
  requireTeamPermission("task:write"),
  taskController.remove,
);

// Task comments
teamsRouter.get(
  "/:teamId/tasks/:taskId/comments",
  requireTeamPermission("team:view"),
  taskController.listComments,
);
teamsRouter.post(
  "/:teamId/tasks/:taskId/comments",
  requireTeamPermission("task:write"),
  taskController.addComment,
);
teamsRouter.delete(
  "/:teamId/tasks/:taskId/comments/:commentId",
  requireTeamPermission("task:write"),
  taskController.removeComment,
);

// Task attachments
teamsRouter.get(
  "/:teamId/tasks/:taskId/attachments",
  requireTeamPermission("team:view"),
  fileController.listTaskAttachments,
);
teamsRouter.post(
  "/:teamId/tasks/:taskId/attachments",
  requireTeamPermission("task:write"),
  fileController.attachToTask,
);
teamsRouter.delete(
  "/:teamId/tasks/:taskId/attachments/:fileId",
  requireTeamPermission("task:write"),
  fileController.detachFromTask,
);

teamsRouter.get(
  "/:teamId",
  requireTeamPermission("team:view"),
  teamController.getOne,
);
teamsRouter.patch(
  "/:teamId",
  requireTeamPermission("team:manage"),
  teamController.update,
);
teamsRouter.delete(
  "/:teamId",
  requireTeamPermission("team:manage"),
  teamController.remove,
);

teamsRouter.get(
  "/:teamId/members",
  requireTeamPermission("team:view"),
  teamController.listMembers,
);
teamsRouter.post(
  "/:teamId/members",
  requireTeamPermission("member:invite"),
  teamController.addMember,
);
teamsRouter.patch(
  "/:teamId/members/:userId",
  requireTeamPermission("member:role:update"),
  teamController.updateMemberRole,
);
teamsRouter.delete(
  "/:teamId/members/:userId",
  requireTeamPermission("member:remove"),
  teamController.removeMember,
);
