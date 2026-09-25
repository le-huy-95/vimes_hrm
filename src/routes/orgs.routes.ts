/**
 * Organization routes — mọi endpoint đều yêu cầu đăng nhập.
 */
import { Router } from "express";
import { orgController } from "../container.js";
import { authenticateJWT } from "../middleware/auth.js";

export const orgsRouter = Router();

orgsRouter.use(authenticateJWT);
orgsRouter.get("/me", orgController.getMe);
orgsRouter.patch("/me", orgController.updateMe);
// Tạo user cùng org (phục vụ invite vào team bằng email)
orgsRouter.post("/me/users", orgController.createUser);
