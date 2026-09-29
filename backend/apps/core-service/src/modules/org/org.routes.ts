import { Router } from "express";
import * as orgController from "./org.controller.js";

export const orgRoutes: Router = Router();

orgRoutes.post("/organizations", orgController.createOrg);
orgRoutes.get("/organizations", orgController.listOrgs);
orgRoutes.post("/organizations/:orgId/invitations", orgController.invite);
orgRoutes.post("/invitations/org/accept", orgController.acceptInvite);
