import express from "express";
import { buildHealth, createLogger, AppError } from "@manage-teams/common";
import { SendEmailSchema, getSentEmails, sendEmail } from "./email.js";
import {
  OtpEmailSchema,
  OrgInviteEmailSchema,
  sendOtpVerifyEmail,
  sendPasswordResetOtpEmail,
  sendOrgInviteEmail,
} from "./handlers.js";

const serviceName = "messaging-service";
const logger = createLogger(serviceName);
const port = Number(process.env.PORT ?? 3206);
const internalToken = process.env.INTERNAL_SERVICE_TOKEN ?? "dev-internal-token";

function requireInternal(req: express.Request): void {
  const header = req.header("x-internal-token");
  if (header !== internalToken) {
    throw new AppError("Unauthorized", "UNAUTHORIZED", 401);
  }
}

function sendError(res: express.Response, err: unknown): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.code, message: err.message });
    return;
  }
  if (err && typeof err === "object" && "issues" in err) {
    res.status(400).json({ error: "VALIDATION", details: err });
    return;
  }
  logger.error({ err }, "request failed");
  res.status(500).json({ error: "INTERNAL" });
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json(buildHealth(serviceName)));

app.post("/internal/email/send", async (req, res) => {
  try {
    requireInternal(req);
    const body = SendEmailSchema.parse(req.body);
    const result = await sendEmail(body);
    res.status(202).json(result);
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/internal/email/otp", async (req, res) => {
  try {
    requireInternal(req);
    const body = OtpEmailSchema.parse(req.body);
    const result = await sendOtpVerifyEmail(body);
    logger.info({ to: body.to, id: result.id, type: "otp" }, "otp email sent");
    res.status(202).json(result);
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/internal/email/password-reset-otp", async (req, res) => {
  try {
    requireInternal(req);
    const body = OtpEmailSchema.parse(req.body);
    const result = await sendPasswordResetOtpEmail(body);
    logger.info({ to: body.to, id: result.id, type: "password_reset" }, "reset otp sent");
    res.status(202).json(result);
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/internal/email/org-invite", async (req, res) => {
  try {
    requireInternal(req);
    const body = OrgInviteEmailSchema.parse(req.body);
    const result = await sendOrgInviteEmail(body);
    logger.info({ to: body.to, id: result.id, type: "org_invite" }, "org invite sent");
    res.status(202).json(result);
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/internal/email/sent", (req, res) => {
  try {
    requireInternal(req);
    res.json({ emails: getSentEmails() });
  } catch (err) {
    sendError(res, err);
  }
});

app.listen(port, () => logger.info({ port }, "messaging-service listening"));
