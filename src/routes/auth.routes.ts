/**
 * Auth routes — mỏng: chỉ gắn middleware + gọi method của AuthController.
 *
 * Ví dụ luồng POST /auth/login:
 *   authRouter → authController.login → AuthService.loginLocal → Repository
 */
import { Router } from "express";
import { authController } from "../container.js";
import { authenticateJWT } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.get("/providers", authController.providers);
authRouter.post("/register", authController.register);
authRouter.post("/login", authController.login);
authRouter.post("/refresh", authController.refresh);
authRouter.post("/logout", authController.logout);
// /me cần JWT hợp lệ (middleware authenticateJWT gắn user vào req)
authRouter.get("/me", authenticateJWT, authController.me);
authRouter.get("/google", authController.googleStart);
authRouter.get("/google/callback", authController.googleCallback);
