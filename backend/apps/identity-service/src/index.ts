import express from "express";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { AppError, buildHealth, createLogger } from "@manage-teams/common";
import { createPool } from "@manage-teams/db";
import { hashPassword, verifyPassword, sha256, randomToken } from "./crypto.js";
import { authMailer } from "./mailer.js";
import { OtpService, getForgotPasswordMessage } from "./otp.js";

const serviceName = "identity-service";
const logger = createLogger(serviceName);
const port = Number(process.env.PORT ?? 3202);
const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-jwt-secret-change-me");
const db = createPool(process.env.POSTGRES_URL ?? "postgresql://mt:mt@localhost:15432/manage_teams");
const otp = new OtpService(db, authMailer);

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).optional(),
});

const VerifySchema = z.object({
  email: z.string().email(),
  code: z.string().min(4),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const ForgotSchema = z.object({ email: z.string().email() });
const ResetSchema = z.object({
  email: z.string().email(),
  code: z.string().min(4),
  newPassword: z.string().min(8),
});

async function issueTokens(user: { id: string; email: string; token_version: number }) {
  const accessToken = await new SignJWT({
    sub: user.id,
    email: user.email,
    tv: user.token_version,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(jwtSecret);

  const refresh = randomToken();
  const refreshHash = sha256(refresh);
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60_000);
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, refreshHash, expires.toISOString()],
  );
  return { accessToken, refreshToken: refresh, expiresIn: 900 };
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

app.post("/auth/register", async (req, res) => {
  try {
    const body = RegisterSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const passwordHash = await hashPassword(body.password);
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [email, passwordHash, body.displayName ?? null],
    );
    const userId = inserted.rows[0]!.id;
    try {
      await otp.issueOtp({
        email,
        purpose: "verify_email",
        userName: body.displayName,
        userId,
      });
    } catch (mailErr) {
      logger.error({ mailErr }, "otp email failed after register");
      throw new AppError("Không gửi được email xác minh", "EMAIL_SEND_FAILED", 503);
    }
    res.status(201).json({ userId, email, message: "Đăng ký thành công. Kiểm tra email để lấy mã xác minh Vimes." });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
      res.status(409).json({ error: "EMAIL_TAKEN", message: "Email đã được sử dụng" });
      return;
    }
    sendError(res, err);
  }
});

app.post("/auth/verify-email", async (req, res) => {
  try {
    const body = VerifySchema.parse(req.body);
    const email = body.email.toLowerCase();
    await otp.verifyOtp({ email, purpose: "verify_email", code: body.code });
    await db.query(`UPDATE users SET email_verified_at = now(), updated_at = now() WHERE email = $1`, [
      email,
    ]);
    res.json({ ok: true, message: "Email đã được xác minh trên Vimes." });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/auth/resend-otp", async (req, res) => {
  try {
    const body = ForgotSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const { rows } = await db.query<{ id: string; display_name: string | null }>(
      `SELECT id, display_name FROM users WHERE email = $1`,
      [email],
    );
    const user = rows[0];
    if (!user) {
      res.json({ message: "Nếu email tồn tại, mã xác minh đã được gửi." });
      return;
    }
    await otp.issueOtp({
      email,
      purpose: "verify_email",
      userName: user.display_name ?? undefined,
      userId: user.id,
    });
    res.json({ message: "Nếu email tồn tại, mã xác minh đã được gửi." });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const body = LoginSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const { rows } = await db.query<{
      id: string;
      email: string;
      password_hash: string | null;
      email_verified_at: string | null;
      token_version: number;
    }>(`SELECT id, email, password_hash, email_verified_at, token_version FROM users WHERE email = $1`, [
      email,
    ]);
    const user = rows[0];
    if (!user?.password_hash || !(await verifyPassword(user.password_hash, body.password))) {
      throw new AppError("Email hoặc mật khẩu không đúng", "INVALID_CREDENTIALS", 401);
    }
    if (!user.email_verified_at) {
      throw new AppError("Email chưa xác minh", "EMAIL_NOT_VERIFIED", 403);
    }
    const tokens = await issueTokens(user);
    res.json({ user: { id: user.id, email: user.email }, ...tokens });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/auth/forgot-password", async (req, res) => {
  try {
    const body = ForgotSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const { rows } = await db.query<{ id: string; display_name: string | null }>(
      `SELECT id, display_name FROM users WHERE email = $1`,
      [email],
    );
    const user = rows[0];
    if (user) {
      try {
        await otp.issueOtp({
          email,
          purpose: "reset_password",
          userName: user.display_name ?? undefined,
          userId: user.id,
        });
      } catch (mailErr) {
        logger.error({ mailErr }, "forgot password mail failed");
      }
    }
    res.json({ message: getForgotPasswordMessage() });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/auth/reset-password", async (req, res) => {
  try {
    const body = ResetSchema.parse(req.body);
    const email = body.email.toLowerCase();
    await otp.verifyOtp({ email, purpose: "reset_password", code: body.code });
    const passwordHash = await hashPassword(body.newPassword);
    const { rows } = await db.query<{ id: string }>(
      `UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = now()
       WHERE email = $2 RETURNING id`,
      [passwordHash, email],
    );
    const userId = rows[0]?.id;
    if (userId) {
      await db.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [
        userId,
      ]);
    }
    res.json({ ok: true, message: "Mật khẩu Vimes đã được cập nhật." });
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/auth/me", async (req, res) => {
  try {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      throw new AppError("Unauthorized", "UNAUTHORIZED", 401);
    }
    const token = header.slice(7);
    const { payload } = await jwtVerify(token, jwtSecret);
    const sub = String(payload.sub);
    const { rows } = await db.query(
      `SELECT id, email, display_name, email_verified_at, token_version FROM users WHERE id = $1`,
      [sub],
    );
    const user = rows[0];
    if (!user) throw new AppError("Unauthorized", "UNAUTHORIZED", 401);
    if (payload.tv !== undefined && payload.tv !== user.token_version) {
      throw new AppError("Token đã hết hiệu lực", "TOKEN_REVOKED", 401);
    }
    res.json({ user });
  } catch (err) {
    sendError(res, err);
  }
});

app.listen(port, () => logger.info({ port }, "identity-service listening"));
