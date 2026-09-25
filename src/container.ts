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
import { SessionService } from "./services/session.service.js";
import { AuthService } from "./services/auth.service.js";
import { OrgService } from "./services/org.service.js";
import { TeamService } from "./services/team.service.js";
import { WorkspaceAuthService } from "./services/workspace-auth.service.js";
import { WorkspaceSyncService } from "./services/workspace-sync.service.js";
import { AuthController } from "./controllers/auth.controller.js";
import { OrgController } from "./controllers/org.controller.js";
import { TeamController } from "./controllers/team.controller.js";
import { WorkspaceSyncController } from "./controllers/workspace-sync.controller.js";

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

// --- Tầng Controller: nhận request, trả response ---
export const authController = new AuthController(authService);
export const orgController = new OrgController(orgService);
export const teamController = new TeamController(teamService);
export const workspaceSyncController = new WorkspaceSyncController(
  workspaceAuthService,
  workspaceSyncService,
);

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
  },
  services: {
    session: sessionService,
    auth: authService,
    org: orgService,
    team: teamService,
    workspaceAuth: workspaceAuthService,
    workspaceSync: workspaceSyncService,
  },
  controllers: {
    auth: authController,
    org: orgController,
    team: teamController,
    workspaceSync: workspaceSyncController,
  },
};
