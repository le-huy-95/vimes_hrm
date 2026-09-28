import { createHash, randomBytes } from "node:crypto";
import express from "express";
import { jwtVerify } from "jose";
import { z } from "zod";
import { AppError, buildHealth, createLogger } from "@manage-teams/common";
import { createPool } from "@manage-teams/db";
import { roleLabelVi, sendOrgInviteEmail } from "./mailer.js";

const serviceName = "core-service";
const logger = createLogger(serviceName);
const port = Number(process.env.PORT ?? 3203);
const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-jwt-secret-change-me");
const appPublicUrl = (process.env.APP_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
const inviteHours = Number(process.env.ORG_INVITE_EXPIRY_HOURS ?? 72);
const db = createPool(process.env.POSTGRES_URL ?? "postgresql://mt:mt@localhost:15432/manage_teams");

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

type AuthUser = { id: string; email: string };

async function requireUser(req: express.Request): Promise<AuthUser> {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new AppError("Unauthorized", "UNAUTHORIZED", 401);
  }
  const { payload } = await jwtVerify(header.slice(7), jwtSecret);
  const id = String(payload.sub);
  const email = String(payload.email ?? "");
  if (!id || !email) throw new AppError("Unauthorized", "UNAUTHORIZED", 401);
  return { id, email: email.toLowerCase() };
}

async function requireOrgAdmin(orgId: string, userId: string): Promise<void> {
  const { rows } = await db.query<{ role: string }>(
    `SELECT role FROM org_members WHERE organization_id = $1 AND user_id = $2`,
    [orgId, userId],
  );
  const role = rows[0]?.role;
  if (role !== "OWNER" && role !== "ADMIN") {
    throw new AppError("Forbidden", "FORBIDDEN", 403);
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

const CreateOrgSchema = z.object({ name: z.string().min(1).max(120) });
const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

const app = express();
app.use(express.json());
app.get("/health", (_req, res) => res.json(buildHealth(serviceName)));

app.post("/organizations", async (req, res) => {
  try {
    const user = await requireUser(req);
    const body = CreateOrgSchema.parse(req.body);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const org = await client.query<{ id: string; name: string }>(
        `INSERT INTO organizations (name) VALUES ($1) RETURNING id, name`,
        [body.name],
      );
      const orgId = org.rows[0]!.id;
      await client.query(
        `INSERT INTO org_members (organization_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
        [orgId, user.id],
      );
      await client.query("COMMIT");
      res.status(201).json({ organization: org.rows[0] });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/organizations", async (req, res) => {
  try {
    const user = await requireUser(req);
    const { rows } = await db.query(
      `SELECT o.id, o.name, m.role
       FROM organizations o
       JOIN org_members m ON m.organization_id = o.id
       WHERE m.user_id = $1
       ORDER BY o.created_at DESC`,
      [user.id],
    );
    res.json({ organizations: rows });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/organizations/:orgId/invitations", async (req, res) => {
  try {
    const user = await requireUser(req);
    const orgId = req.params.orgId;
    await requireOrgAdmin(orgId, user.id);
    const body = InviteSchema.parse(req.body);
    const email = body.email.toLowerCase();

    const org = await db.query<{ name: string }>(`SELECT name FROM organizations WHERE id = $1`, [
      orgId,
    ]);
    if (!org.rows[0]) throw new AppError("Not found", "NOT_FOUND", 404);

    const inviter = await db.query<{ display_name: string | null; email: string }>(
      `SELECT display_name, email FROM users WHERE id = $1`,
      [user.id],
    );
    const inviterName = inviter.rows[0]?.display_name || inviter.rows[0]?.email || "Thành viên Vimes";

    const token = randomToken();
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + inviteHours * 60 * 60_000);
    await db.query(
      `INSERT INTO org_invitations (organization_id, email, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orgId, email, body.role, tokenHash, user.id, expiresAt.toISOString()],
    );

    const acceptUrl = `${appPublicUrl}/invites/org?token=${encodeURIComponent(token)}`;
    try {
      await sendOrgInviteEmail({
        to: email,
        orgName: org.rows[0].name,
        roleLabel: roleLabelVi(body.role),
        inviterName,
        acceptUrl,
        expiryHours: inviteHours,
        userId: user.id,
      });
    } catch (mailErr) {
      logger.error({ mailErr }, "invite email failed");
      throw new AppError("Không gửi được email lời mời", "EMAIL_SEND_FAILED", 503);
    }

    res.status(201).json({
      ok: true,
      expiresAt: expiresAt.toISOString(),
      message: "Đã gửi lời mời tổ chức trên Vimes.",
    });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/invitations/org/accept", async (req, res) => {
  try {
    const user = await requireUser(req);
    const body = z.object({ token: z.string().min(10) }).parse(req.body);
    const tokenHash = sha256(body.token);
    const { rows } = await db.query<{
      id: string;
      organization_id: string;
      email: string;
      role: string;
      expires_at: Date;
      consumed_at: Date | null;
    }>(
      `SELECT id, organization_id, email, role, expires_at, consumed_at
       FROM org_invitations WHERE token_hash = $1`,
      [tokenHash],
    );
    const invite = rows[0];
    if (!invite || invite.consumed_at) {
      throw new AppError("Lời mời không hợp lệ hoặc đã dùng", "INVITE_INVALID", 410);
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      throw new AppError("Lời mời đã hết hạn", "INVITE_EXPIRED", 410);
    }
    if (invite.email.toLowerCase() !== user.email) {
      throw new AppError("Email đăng nhập không khớp lời mời", "INVITE_EMAIL_MISMATCH", 403);
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO org_members (organization_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [invite.organization_id, user.id, invite.role],
      );
      await client.query(`UPDATE org_invitations SET consumed_at = now() WHERE id = $1`, [
        invite.id,
      ]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    res.json({ ok: true, organizationId: invite.organization_id });
  } catch (err) {
    sendError(res, err);
  }
});

app.listen(port, () => logger.info({ port }, "core-service listening"));
