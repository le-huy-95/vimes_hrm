import type { Request, Response } from "express";
import { createLogger, sendError } from "@manage-teams/lib";
import * as loginService from "./login.service.js";
import {
  GoogleAuthorizeSchema,
  GoogleCodeSchema,
  GoogleIdTokenSchema,
  LoginSchema,
} from "./login.schemas.js";

const logger = createLogger("identity-service");

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const body = LoginSchema.parse(req.body);
    res.json(await loginService.loginWithPassword(body.email, body.password));
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function googleAuthorizeUrl(req: Request, res: Response): Promise<void> {
  try {
    const body = GoogleAuthorizeSchema.parse(req.body);
    res.json(await loginService.buildAuthorizeUrl(body));
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function googleCallback(req: Request, res: Response): Promise<void> {
  try {
    const body = GoogleCodeSchema.parse(req.body);
    res.json(await loginService.loginWithGoogleCode(body));
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function googleIdToken(req: Request, res: Response): Promise<void> {
  try {
    const body = GoogleIdTokenSchema.parse(req.body);
    res.json(
      await loginService.loginWithGoogleIdToken(
        body.idToken,
        body.serverAuthCode,
        body.redirectUri,
      ),
    );
  } catch (err) {
    sendError(res, err, logger);
  }
}
