/**
 * UserRepository — CRUD / query bảng users.
 * Không chứa rule nghiệp vụ (ví dụ: "email đã tồn tại thì báo lỗi" nằm ở Service).
 */
import type { Prisma, UserStatus } from "@prisma/client";
import { BaseRepository } from "./base.repository.js";

/** Field trả về cho GET /auth/me */
const meSelect = {
  id: true,
  email: true,
  fullName: true,
  orgId: true,
  status: true,
  googleUserId: true,
  org: { select: { id: true, name: true, domain: true } },
} satisfies Prisma.UserSelect;

const publicUserSelect = {
  id: true,
  email: true,
  fullName: true,
  orgId: true,
  status: true,
} satisfies Prisma.UserSelect;

export class UserRepository extends BaseRepository {
  findByEmail(email: string) {
    return this.db.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  findById(id: string) {
    return this.db.user.findUnique({ where: { id } });
  }

  findByIdWithOrg(id: string) {
    return this.db.user.findUnique({
      where: { id },
      select: meSelect,
    });
  }

  findByGoogleOrEmail(googleUserId: string, email: string) {
    return this.db.user.findFirst({
      where: {
        OR: [{ googleUserId }, { email: email.toLowerCase() }],
      },
    });
  }

  create(data: Prisma.UserCreateInput | Prisma.UserUncheckedCreateInput) {
    return this.db.user.create({ data });
  }

  createPublic(data: Prisma.UserUncheckedCreateInput) {
    return this.db.user.create({
      data,
      select: publicUserSelect,
    });
  }

  updateGoogleUserId(userId: string, googleUserId: string) {
    return this.db.user.update({
      where: { id: userId },
      data: { googleUserId },
    });
  }

  findManyInOrgByEmailsOrGoogleIds(orgId: string, emails: string[], googleIds: string[]) {
    const ors: Prisma.UserWhereInput[] = [];
    if (emails.length > 0) ors.push({ email: { in: emails.map((e) => e.toLowerCase()) } });
    if (googleIds.length > 0) ors.push({ googleUserId: { in: googleIds } });
    if (ors.length === 0) return Promise.resolve([]);
    return this.db.user.findMany({ where: { orgId, OR: ors } });
  }

  createInvited(input: { orgId: string; email: string; fullName: string; googleUserId: string }) {
    return this.db.user.create({
      data: {
        orgId: input.orgId,
        email: input.email.toLowerCase(),
        fullName: input.fullName,
        googleUserId: input.googleUserId,
        status: "invited",
        passwordHash: null,
      },
    });
  }

  updateStatus(userId: string, status: UserStatus) {
    return this.db.user.update({ where: { id: userId }, data: { status } });
  }

  linkGoogleId(userId: string, googleUserId: string) {
    return this.db.user.update({ where: { id: userId }, data: { googleUserId } });
  }

  updateAvatarFile(userId: string, avatarFileId: string | null) {
    return this.db.user.update({ where: { id: userId }, data: { avatarFileId } });
  }
}
