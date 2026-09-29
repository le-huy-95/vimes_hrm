import { Router } from "express";
import * as taskController from "./task.controller.js";

export const taskRoutes: Router = Router();

taskRoutes.post("/groups/:groupId/tasks", taskController.createTask);
taskRoutes.get("/groups/:groupId/tasks", taskController.listTasks);
taskRoutes.get("/groups/:groupId/tasks/:code", taskController.getTask);
taskRoutes.patch("/groups/:groupId/tasks/:code", taskController.patchTask);
taskRoutes.post("/groups/:groupId/tasks/:code/claim", taskController.claimTask);
taskRoutes.post("/groups/:groupId/tasks/:code/complete", taskController.completeTask);
taskRoutes.post("/groups/:groupId/tasks/:code/assign", taskController.assignTask);
taskRoutes.post("/internal/tasks/complete", (req, res) =>
  void taskController.completeTaskInternal(req, res),
);
