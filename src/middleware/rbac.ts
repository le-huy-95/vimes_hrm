/**
 * Middleware RBAC theo team:
 * kiểm tra user là member + role có permissionKey tương ứng.
 */
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import type { AuthedRequest } from "./auth.js";

export function requireTeamPermission(permissionKey: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const { user } = req as AuthedRequest;
      const teamId = String(req.params.teamId ?? "");
      if (!teamId) throw new AppError(400, "teamId required");

      const team = await prisma.team.findUnique({ where: { id: teamId } });
      if (!team || team.orgId !== user.orgId) {
        throw new AppError(404, "Team not found");
      }

      const membership = await prisma.teamMember.findUnique({
        where: {
          teamId_userId: { teamId, userId: user.sub },
        },
      });
      if (!membership) {
        throw new AppError(403, "Not a team member");
      }

      const allowed = await prisma.rolePermission.findUnique({
        where: {
          roleName_permissionKey: {
            roleName: membership.role,
            permissionKey,
          },
        },
      });
      if (!allowed) {
        throw new AppError(403, `Missing permission: ${permissionKey}`);
      }

      (req as AuthedRequest & { teamRole: string }).teamRole = membership.role;
      next();
    } catch (err) {
      next(err);
    }
  };
}
