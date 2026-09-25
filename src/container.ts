/**
 * Composition root (Dependency Injection thủ công).
 *
 * Đây là nơi DUY NHẤT tạo instance thật:
 *   Repository (DB) → Service (business) → Controller (HTTP)
 *
 * Controller/Service không `new` dependency bên trong — nhận qua constructor
 * (nguyên tắc Dependency Inversion / SOLID).
 */
import { prisma } from "./lib/prisma.js";
import { UserRepository } from "./repositories/user.repository.js";
import { OrgRepository } from "./repositories/org.repository.js";
import { TeamRepository } from "./repositories/team.repository.js";
import { OauthRepository } from "./repositories/oauth.repository.js";
import { RefreshTokenRepository } from "./repositories/refresh-token.repository.js";
import { AuditRepository } from "./repositories/audit.repository.js";
import { WorkspaceSettingsRepository } from "./repositories/workspace-settings.repository.js";
import { WorkspaceSyncRepository } from "./repositories/workspace-sync.repository.js";
import { SyncLogRepository } from "./repositories/sync-log.repository.js";
import { WorkspaceGroupMapRepository } from "./repositories/workspace-group-map.repository.js";
import { GithubConnectionRepository } from "./repositories/github-connection.repository.js";
import { GithubRepoRepository } from "./repositories/github-repo.repository.js";
import { GithubActivityRepository } from "./repositories/github-activity.repository.js";
import { GithubDeliveryRepository } from "./repositories/github-delivery.repository.js";
import { ProjectRepository } from "./repositories/project.repository.js";
import { FileRepository } from "./repositories/file.repository.js";
import { TaskAttachmentRepository } from "./repositories/task-attachment.repository.js";
import { TaskRepository } from "./repositories/task.repository.js";
import { ChannelRepository } from "./repositories/channel.repository.js";
import { MessageRepository } from "./repositories/message.repository.js";
import { SessionService } from "./services/session.service.js";
import { AuthService } from "./services/auth.service.js";
import { OrgService } from "./services/org.service.js";
import { TeamService } from "./services/team.service.js";
import { WorkspaceAuthService } from "./services/workspace-auth.service.js";
import { WorkspaceSyncService } from "./services/workspace-sync.service.js";
import { GithubAppService } from "./services/github-app.service.js";
import { GithubSyncService } from "./services/github-sync.service.js";
import { GithubWebhookService } from "./services/github-webhook.service.js";
import { ProjectService } from "./services/project.service.js";
import { FileService } from "./services/file.service.js";
import { TaskService } from "./services/task.service.js";
import { ChatService } from "./services/chat.service.js";
import { DashboardService } from "./services/dashboard.service.js";
import { AuthController } from "./controllers/auth.controller.js";
import { OrgController } from "./controllers/org.controller.js";
import { TeamController } from "./controllers/team.controller.js";
import { WorkspaceSyncController } from "./controllers/workspace-sync.controller.js";
import { ProjectController } from "./controllers/project.controller.js";
import { FileController } from "./controllers/file.controller.js";
import { TaskController } from "./controllers/task.controller.js";
import { ChatController } from "./controllers/chat.controller.js";
import { DashboardController } from "./controllers/dashboard.controller.js";
import { GithubTeamController } from "./controllers/github-team.controller.js";
import { GithubWebhookController } from "./controllers/github-webhook.controller.js";

// --- Tầng Repository: chỉ nói chuyện với Prisma ---
const userRepository = new UserRepository(prisma);
const orgRepository = new OrgRepository(prisma);
const teamRepository = new TeamRepository(prisma);
const oauthRepository = new OauthRepository(prisma);
const refreshTokenRepository = new RefreshTokenRepository(prisma);
const auditRepository = new AuditRepository(prisma);
const workspaceSettingsRepository = new WorkspaceSettingsRepository(prisma);
const workspaceSyncRepository = new WorkspaceSyncRepository(prisma);
const workspaceGroupMapRepository = new WorkspaceGroupMapRepository(prisma);
const syncLogRepository = new SyncLogRepository(prisma);
const githubConnectionRepository = new GithubConnectionRepository(prisma);
const githubRepoRepository = new GithubRepoRepository(prisma);
const githubActivityRepository = new GithubActivityRepository(prisma);
const githubDeliveryRepository = new GithubDeliveryRepository(prisma);
const projectRepository = new ProjectRepository(prisma);
const taskRepository = new TaskRepository(prisma);
const fileRepository = new FileRepository(prisma);
const taskAttachmentRepository = new TaskAttachmentRepository(prisma);
const channelRepository = new ChannelRepository(prisma);
const messageRepository = new MessageRepository(prisma);

// --- Tầng Service: nghiệp vụ, không set HTTP status ---
const sessionService = new SessionService(refreshTokenRepository);

const authService = new AuthService(
  prisma,
  userRepository,
  orgRepository,
  oauthRepository,
  refreshTokenRepository,
  sessionService,
);

const orgService = new OrgService(
  orgRepository,
  userRepository,
  auditRepository,
);

const teamService = new TeamService(
  prisma,
  teamRepository,
  userRepository,
  auditRepository,
);

const workspaceAuthService = new WorkspaceAuthService(
  oauthRepository,
  workspaceSettingsRepository,
);

const workspaceSyncService = new WorkspaceSyncService(
  workspaceAuthService,
  workspaceSettingsRepository,
  workspaceSyncRepository,
  syncLogRepository,
  workspaceGroupMapRepository,
  userRepository,
  teamRepository,
  auditRepository,
);

const githubAppService = new GithubAppService(
  githubConnectionRepository,
  githubRepoRepository,
  githubActivityRepository,
  teamRepository,
  auditRepository,
);

const githubSyncService = new GithubSyncService(
  githubConnectionRepository,
  githubRepoRepository,
);

const githubWebhookService = new GithubWebhookService(
  githubDeliveryRepository,
  githubConnectionRepository,
  githubRepoRepository,
  githubActivityRepository,
  githubSyncService,
  taskRepository,
);

const projectService = new ProjectService(
  prisma,
  projectRepository,
  teamRepository,
  auditRepository,
);

const taskService = new TaskService(
  prisma,
  taskRepository,
  projectRepository,
  teamRepository,
  auditRepository,
);

const fileService = new FileService(
  fileRepository,
  taskAttachmentRepository,
  taskRepository,
  userRepository,
);

const chatService = new ChatService(
  channelRepository,
  messageRepository,
  teamRepository,
  fileRepository,
);

const dashboardService = new DashboardService(
  prisma,
  teamRepository,
  channelRepository,
  githubConnectionRepository,
);

// --- Tầng Controller: nhận request, trả response ---
export const authController = new AuthController(authService);
export const orgController = new OrgController(orgService);
export const teamController = new TeamController(teamService);
export const workspaceSyncController = new WorkspaceSyncController(
  workspaceAuthService,
  workspaceSyncService,
);
export const githubTeamController = new GithubTeamController(
  githubAppService,
  githubSyncService,
);
export const githubWebhookController = new GithubWebhookController(
  githubWebhookService,
);
export const projectController = new ProjectController(projectService);
export const taskController = new TaskController(taskService);
export const fileController = new FileController(fileService);
export const chatController = new ChatController(chatService);
export const dashboardController = new DashboardController(dashboardService);

/** Object gom toàn bộ dependency — tiện debug / test sau này. */
export const container = {
  prisma,
  repositories: {
    user: userRepository,
    org: orgRepository,
    team: teamRepository,
    oauth: oauthRepository,
    refreshToken: refreshTokenRepository,
    audit: auditRepository,
    workspaceSettings: workspaceSettingsRepository,
    workspaceSync: workspaceSyncRepository,
    workspaceGroupMap: workspaceGroupMapRepository,
    syncLog: syncLogRepository,
    githubConnection: githubConnectionRepository,
    githubRepo: githubRepoRepository,
    githubActivity: githubActivityRepository,
    githubDelivery: githubDeliveryRepository,
    project: projectRepository,
    task: taskRepository,
    file: fileRepository,
    taskAttachment: taskAttachmentRepository,
    channel: channelRepository,
    message: messageRepository,
  },
  services: {
    session: sessionService,
    auth: authService,
    org: orgService,
    team: teamService,
    workspaceAuth: workspaceAuthService,
    workspaceSync: workspaceSyncService,
    githubApp: githubAppService,
    githubSync: githubSyncService,
    githubWebhook: githubWebhookService,
    project: projectService,
    task: taskService,
    file: fileService,
    chat: chatService,
    dashboard: dashboardService,
  },
  controllers: {
    auth: authController,
    org: orgController,
    team: teamController,
    workspaceSync: workspaceSyncController,
    githubTeam: githubTeamController,
    githubWebhook: githubWebhookController,
    project: projectController,
    task: taskController,
    file: fileController,
    chat: chatController,
    dashboard: dashboardController,
  },
};
