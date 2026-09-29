import { prismaRead } from "@manage-teams/db";
import { AppError } from "@manage-teams/lib";

/** Bắt buộc user là OWNER/ADMIN của org. */
export async function requireOrgAdmin(orgId: string, userId: string): Promise<void> {
  const member = await prismaRead.orgMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
  });
  if (member?.role !== "OWNER" && member?.role !== "ADMIN") {
    throw new AppError("Không có quyền", "FORBIDDEN", 403);
  }
}

/** Bắt buộc user là thành viên org. */
export async function requireOrgMember(orgId: string, userId: string): Promise<void> {
  const member = await prismaRead.orgMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
  });
  if (!member) throw new AppError("Không có quyền", "FORBIDDEN", 403);
}

/** Bắt buộc user ACTIVE trong group; trả role. */
export async function requireGroupMember(groupId: string, userId: string): Promise<{ role: string }> {
  const member = await prismaRead.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!member || member.status !== "ACTIVE") {
    throw new AppError("Không có quyền", "FORBIDDEN", 403);
  }
  return { role: member.role };
}

/** Bắt buộc user OWNER/ADMIN của group. */
export async function requireGroupAdmin(groupId: string, userId: string): Promise<void> {
  const { role } = await requireGroupMember(groupId, userId);
  if (role !== "OWNER" && role !== "ADMIN") {
    throw new AppError("Không có quyền", "FORBIDDEN", 403);
  }
}
