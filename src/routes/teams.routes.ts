/**
 * Team routes — JWT bắt buộc; các thao tác theo teamId kiểm tra RBAC.
 *
 * requireTeamPermission("team:view") đọc role của user trong team
 * rồi đối chiếu bảng roles_permissions.
 */
import { Router } from "express";
import { teamController } from "../container.js";
import { authenticateJWT } from "../middleware/auth.js";
import { requireTeamPermission } from "../middleware/rbac.js";

export const teamsRouter = Router();

teamsRouter.use(authenticateJWT);

teamsRouter.get("/", teamController.list);
teamsRouter.post("/", teamController.create);

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
