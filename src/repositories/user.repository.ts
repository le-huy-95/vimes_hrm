/**
 * UserRepository — CRUD / query bảng users.
 * Không chứa rule nghiệp vụ (ví dụ: "email đã tồn tại thì báo lỗi" nằm ở Service).
 */
import type { Prisma } from "@prisma/client";
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
}
