import { Router } from "express";
import * as groupController from "./group.controller.js";

export const groupRoutes: Router = Router();

groupRoutes.post("/organizations/:orgId/groups", groupController.createGroup);
groupRoutes.get("/organizations/:orgId/groups", groupController.listGroups);
groupRoutes.get("/groups/:groupId", groupController.getGroup);
groupRoutes.post("/groups/:groupId/members", groupController.addMember);
groupRoutes.delete("/groups/:groupId/members/:userId", groupController.removeMember);
groupRoutes.post("/groups/:groupId/leave", groupController.leaveGroup);
