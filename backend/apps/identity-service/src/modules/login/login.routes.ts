import { Router } from "express";
import * as loginController from "./login.controller.js";

/** Login-only routes (password + Google sign-in). */
export const loginRoutes: Router = Router();

loginRoutes.post("/auth/login", (req, res) => void loginController.login(req, res));
loginRoutes.post("/auth/google/authorize-url", (req, res) =>
  void loginController.googleAuthorizeUrl(req, res),
);
loginRoutes.post("/auth/google/callback", (req, res) => void loginController.googleCallback(req, res));
loginRoutes.post("/auth/google/id-token", (req, res) => void loginController.googleIdToken(req, res));
