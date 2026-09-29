import { Router } from "express";
import * as authController from "./auth.controller.js";

/** Account lifecycle routes (register, OTP, reset, me, Google link). Login is separate. */
export const authRoutes: Router = Router();

authRoutes.post("/auth/register", (req, res) => void authController.register(req, res));
authRoutes.post("/auth/verify-email", (req, res) => void authController.verifyEmail(req, res));
authRoutes.post("/auth/resend-otp", (req, res) => void authController.resendOtp(req, res));
authRoutes.post("/auth/forgot-password", (req, res) => void authController.forgotPassword(req, res));
authRoutes.post("/auth/reset-password", (req, res) => void authController.resetPassword(req, res));
authRoutes.post("/auth/refresh", (req, res) => void authController.refresh(req, res));
authRoutes.get("/auth/me", (req, res) => void authController.me(req, res));
authRoutes.post("/auth/google/link", (req, res) => void authController.googleLink(req, res));
authRoutes.post("/auth/google/link-id-token", (req, res) =>
  void authController.googleLinkIdToken(req, res),
);
authRoutes.post("/auth/google/accounts/:googleSub/primary", (req, res) =>
  void authController.googleSetPrimary(req, res),
);
