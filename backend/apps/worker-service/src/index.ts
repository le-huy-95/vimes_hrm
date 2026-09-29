/**
 * worker-service — tác vụ nền / email (port 3206).
 * Identity & core gọi /internal/email/* với x-internal-token; không public cho user.
 */
/**
 * WORKER SERVICE — job nền / email (:3206)
 * ----------------------------------------
 * Mục đích: gửi OTP, reset password, org invite qua SMTP (hoặc inbox dev).
 * Identity/core gọi nội bộ bằng `x-internal-token` — không expose ra client.
 */
import express from "express";
import { buildHealth, createLogger, AppError } from "@manage-teams/lib";
import { SendEmailSchema, getSentEmails, sendEmail } from "./email.js";
import {
  OtpEmailSchema,
  OrgInviteEmailSchema,
  sendOtpVerifyEmail,
  sendPasswordResetOtpEmail,
  sendOrgInviteEmail,
} from "./handlers.js";
import { processPushJobs } from "./push.js";

const serviceName = "worker-service";
const logger = createLogger(serviceName);
const port = Number(process.env.PORT ?? 3206);
const internalToken = process.env.INTERNAL_SERVICE_TOKEN ?? "dev-internal-token";

function requireInternal(req: express.Request): void {
  const header = req.header("x-internal-token");
  if (header !== internalToken) {
    throw new AppError("Chưa xác thực", "UNAUTHORIZED", 401);
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

app.get("/health", (_req, res) =>
  res.json({
    ...buildHealth(serviceName),
    smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  }),
);

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

/** Phase 1.7 stub: xử lý hàng đợi push_jobs (log, chưa FCM). */
app.post("/internal/push/process", async (req, res) => {
  try {
    requireInternal(req);
    const limit = Number(req.body?.limit ?? 20);
    const result = await processPushJobs(limit);
    res.status(202).json({ ok: true, stub: true, ...result });
  } catch (err) {
    sendError(res, err);
  }
});

/** Phase 5: replay DLQ — ưu tiên sync_jobs FAILED trên google-sync; Kafka offset stub. */
app.post("/internal/dlq/replay", async (req, res) => {
  try {
    requireInternal(req);
    const topic = typeof req.body?.topic === "string" ? req.body.topic : "sync_jobs";
    const limit = Number(req.body?.limit ?? 10);
    const googleSyncUrl = (process.env.GOOGLE_SYNC_URL ?? "http://localhost:3207").replace(
      /\/$/,
      "",
    );

    if (topic === "sync_jobs" || topic === "google.sync") {
      const upstream = await fetch(`${googleSyncUrl}/internal/sync/dlq/replay`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-token": internalToken,
        },
        body: JSON.stringify({
          limit,
          includeAuthRequired: Boolean(req.body?.includeAuthRequired),
        }),
      });
      const json = await upstream.json().catch(() => ({}));
      logger.info({ topic, limit, status: upstream.status }, "dlq replay via google-sync");
      res.status(upstream.ok ? 202 : upstream.status).json({
        ok: upstream.ok,
        topic,
        via: "google-sync",
        result: json,
      });
      return;
    }

    logger.info({ topic, limit }, "dlq replay kafka stub accepted");
    res.status(202).json({
      ok: true,
      stub: true,
      topic,
      limit,
      message: "Kafka DLQ offset seek chưa gắn — dùng topic=sync_jobs để phát lại sync FAILED",
    });
  } catch (err) {
    sendError(res, err);
  }
});

/** Phase 6e stub: digest việc trễ hạn (email inbox). */
app.post("/internal/jobs/overdue-digest", async (req, res) => {
  try {
    requireInternal(req);
    const to = typeof req.body?.to === "string" ? req.body.to : "digest@example.com";
    const count = Number(req.body?.overdueCount ?? 0);
    const result = await sendEmail({
      to,
      subject: "[Manage Teams] Nhắc việc trễ hạn (stub)",
      text: `Bạn có ~${count} việc đang theo dõi / trễ hạn. Mở app để xem chi tiết.`,
      html: `<p>Bạn có <b>${count}</b> việc đang theo dõi / trễ hạn.</p><p>Đây là digest stub Phase 6e.</p>`,
    });
    logger.info({ to, id: result.id }, "overdue digest stub sent");
    res.status(202).json({ ok: true, stub: true, email: result });
  } catch (err) {
    sendError(res, err);
  }
});

app.listen(port, () => {
  logger.info(
    {
      port,
      smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
      smtpHost: process.env.SMTP_HOST ?? null,
    },
    "worker-service listening",
  );
  // Poll push stub mỗi 15s (dev) — tắt bằng PUSH_POLL_MS=0
  const pollMs = Number(process.env.PUSH_POLL_MS ?? 15_000);
  if (pollMs > 0) {
    setInterval(() => {
      void processPushJobs(20).catch((err) => logger.warn({ err }, "push poll failed"));
    }, pollMs);
  }
});
