/**
 * Organization routes — JWT required except Workspace OAuth callback.
 */
import { Router } from "express";
import { orgController, workspaceSyncController } from "../container.js";
import { authenticateJWT } from "../middleware/auth.js";

export const orgsRouter = Router();

// Public: Google redirects here without Authorization header
orgsRouter.get(
  "/me/workspace/connect/callback",
  workspaceSyncController.connectCallback,
);

orgsRouter.use(authenticateJWT);
orgsRouter.get("/me", orgController.getMe);
orgsRouter.patch("/me", orgController.updateMe);
// Tạo user cùng org (phục vụ invite vào team bằng email)
orgsRouter.post("/me/users", orgController.createUser);

// Workspace connect + Directory sync
orgsRouter.get("/me/workspace/auth-status", workspaceSyncController.authStatus);
orgsRouter.get("/me/workspace/connect", workspaceSyncController.connectStart);
orgsRouter.post("/me/google-sync", workspaceSyncController.enqueueSync);
orgsRouter.get("/me/google-sync/status", workspaceSyncController.status);
orgsRouter.get("/me/google-sync/logs", workspaceSyncController.logs);
orgsRouter.get("/me/google-sync/users", workspaceSyncController.syncedUsers);
orgsRouter.get("/me/google-groups", workspaceSyncController.listGroups);
orgsRouter.put(
  "/me/google-groups/:groupEmail/team",
  workspaceSyncController.mapGroup,
);
orgsRouter.delete(
  "/me/google-groups/:groupEmail/team",
  workspaceSyncController.unmapGroup,
);
