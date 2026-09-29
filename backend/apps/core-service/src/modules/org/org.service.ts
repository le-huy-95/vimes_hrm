import { AppError, createLogger, randomToken, sha256 } from "@manage-teams/lib";
import { prismaRead, prismaWrite } from "@manage-teams/db";
import { roleLabelVi, sendOrgInviteEmail } from "../../mailer.js";
import { requireOrgAdmin } from "../access/access.service.js";

const logger = createLogger("core-service");

function inviteConfig(): { appPublicUrl: string; inviteHours: number } {
  return {
    appPublicUrl: (process.env.APP_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    inviteHours: Number(process.env.ORG_INVITE_EXPIRY_HOURS ?? 72),
  };
}

export async function createOrg(userId: string, name: string) {
  return prismaWrite.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name } });
    await tx.orgMember.create({
      data: { organizationId: org.id, userId, role: "OWNER" },
    });
    return org;
  });
}

export async function listOrgs(userId: string) {
  const rows = await prismaRead.orgMember.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { organization: { createdAt: "desc" } },
  });
  return rows.map((r) => ({
    id: r.organization.id,
    name: r.organization.name,
    role: r.role,
  }));
}

export async function inviteToOrg(
  orgId: string,
  inviterId: string,
  emailRaw: string,
  role: "ADMIN" | "MEMBER",
): Promise<{ expiresAt: string }> {
  await requireOrgAdmin(orgId, inviterId);
  const email = emailRaw.toLowerCase();
  const { appPublicUrl, inviteHours } = inviteConfig();

  const org = await prismaRead.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new AppError("Không tìm thấy", "NOT_FOUND", 404);

  const inviter = await prismaRead.user.findUnique({ where: { id: inviterId } });
  const inviterName = inviter?.displayName || inviter?.email || "Thành viên Vimes";

  const token = randomToken();
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + inviteHours * 60 * 60_000);
  await prismaWrite.orgInvitation.create({
    data: {
      organizationId: orgId,
      email,
      role,
      tokenHash,
      invitedById: inviterId,
      expiresAt,
    },
  });

  const acceptUrl = `${appPublicUrl}/invites/org?token=${encodeURIComponent(token)}`;
  try {
    await sendOrgInviteEmail({
      to: email,
      orgName: org.name,
      roleLabel: roleLabelVi(role),
      inviterName,
      acceptUrl,
      expiryHours: inviteHours,
      userId: inviterId,
    });
  } catch (mailErr) {
    logger.error({ mailErr }, "invite email failed");
    throw new AppError("Không gửi được email lời mời", "EMAIL_SEND_FAILED", 503);
  }

  return { expiresAt: expiresAt.toISOString() };
}

export async function acceptOrgInvite(token: string, userId: string, userEmail: string) {
  const tokenHash = sha256(token);
  const invite = await prismaRead.orgInvitation.findUnique({ where: { tokenHash } });
  if (!invite || invite.consumedAt) {
    throw new AppError("Lời mời không hợp lệ hoặc đã dùng", "INVITE_INVALID", 410);
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    throw new AppError("Lời mời đã hết hạn", "INVITE_EXPIRED", 410);
  }
  if (invite.email.toLowerCase() !== userEmail) {
    throw new AppError("Email đăng nhập không khớp lời mời", "INVITE_EMAIL_MISMATCH", 403);
  }

  await prismaWrite.$transaction(async (tx) => {
    await tx.orgMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: invite.organizationId,
          userId,
        },
      },
      create: {
        organizationId: invite.organizationId,
        userId,
        role: invite.role,
      },
      update: { role: invite.role },
    });
    await tx.orgInvitation.update({
      where: { id: invite.id },
      data: { consumedAt: new Date() },
    });
  });

  return { organizationId: invite.organizationId };
}
