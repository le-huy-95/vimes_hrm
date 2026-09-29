import type { Request, Response } from "express";
import { createLogger, sendError } from "@manage-teams/lib";
import { Prisma } from "@manage-teams/db";
import * as authService from "./auth.service.js";
import {
  ForgotSchema,
  GoogleCodeSchema,
  GoogleIdTokenLinkSchema,
  RefreshSchema,
  RegisterSchema,
  ResetSchema,
  VerifySchema,
} from "./auth.schemas.js";

const logger = createLogger("identity-service");

function sendIdentityError(res: Response, err: unknown): void {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    res.status(409).json({ error: "EMAIL_TAKEN", message: "Email đã được sử dụng" });
    return;
  }
  sendError(res, err, logger);
}

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const body = RegisterSchema.parse(req.body);
    const result = await authService.register(body);
    res.status(201).json(result);
  } catch (err) {
    sendIdentityError(res, err);
  }
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  try {
    const body = VerifySchema.parse(req.body);
    res.json(await authService.verifyEmail(body.email, body.code));
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function resendOtp(req: Request, res: Response): Promise<void> {
  try {
    const body = ForgotSchema.parse(req.body);
    res.json(await authService.resendOtp(body.email));
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  try {
    const body = ForgotSchema.parse(req.body);
    res.json(await authService.forgotPassword(body.email));
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  try {
    const body = ResetSchema.parse(req.body);
    res.json(await authService.resetPassword(body.email, body.code, body.newPassword));
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const body = RefreshSchema.parse(req.body);
    res.json(await authService.refreshSession(body.refreshToken));
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  try {
    res.json(await authService.getMe(req.header("authorization")));
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function googleLink(req: Request, res: Response): Promise<void> {
  try {
    const body = GoogleCodeSchema.parse(req.body);
    res.json(await authService.googleLink(req.header("authorization"), body));
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function googleLinkIdToken(req: Request, res: Response): Promise<void> {
  try {
    const body = GoogleIdTokenLinkSchema.parse(req.body);
    res.json(await authService.googleLinkIdToken(req.header("authorization"), body));
  } catch (err) {
    sendError(res, err, logger);
  }
}

export async function googleSetPrimary(req: Request, res: Response): Promise<void> {
  try {
    const googleSub = String(req.params.googleSub ?? "");
    if (!googleSub) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Cần googleSub" });
      return;
    }
    res.json(await authService.googleSetPrimary(req.header("authorization"), googleSub));
  } catch (err) {
    sendError(res, err, logger);
  }
}
