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
import { SessionService } from "./services/session.service.js";
import { AuthService } from "./services/auth.service.js";
import { OrgService } from "./services/org.service.js";
import { TeamService } from "./services/team.service.js";
import { AuthController } from "./controllers/auth.controller.js";
import { OrgController } from "./controllers/org.controller.js";
import { TeamController } from "./controllers/team.controller.js";

// --- Tầng Repository: chỉ nói chuyện với Prisma ---
const userRepository = new UserRepository(prisma);
const orgRepository = new OrgRepository(prisma);
const teamRepository = new TeamRepository(prisma);
const oauthRepository = new OauthRepository(prisma);
const refreshTokenRepository = new RefreshTokenRepository(prisma);
const auditRepository = new AuditRepository(prisma);

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

// --- Tầng Controller: nhận request, trả response ---
export const authController = new AuthController(authService);
export const orgController = new OrgController(orgService);
export const teamController = new TeamController(teamService);

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
  },
  services: {
    session: sessionService,
    auth: authService,
    org: orgService,
    team: teamService,
  },
  controllers: {
    auth: authController,
    org: orgController,
    team: teamController,
  },
};
