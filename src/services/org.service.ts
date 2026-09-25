/**
 * OrgService — nghiệp vụ tổ chức: xem/sửa org, tạo user cùng org.
 */
import { hashPassword } from "../lib/password.js";
import { AppError } from "../lib/errors.js";
import type { OrgRepository } from "../repositories/org.repository.js";
import type { UserRepository } from "../repositories/user.repository.js";
import type { AuditRepository } from "../repositories/audit.repository.js";

export class OrgService {
  constructor(
    private readonly orgs: OrgRepository,
    private readonly users: UserRepository,
    private readonly audit: AuditRepository,
  ) {}

  async getMine(orgId: string) {
    const org = await this.orgs.findById(orgId);
    if (!org) throw new AppError(404, "Organization not found");
    return org;
  }

  async updateMine(
    orgId: string,
    input: { name?: string; domain?: string | null },
  ) {
    return this.orgs.update(orgId, input);
  }

  /**
   * Provision user trong cùng org (cần có trước khi invite vào team bằng email).
   * Ghi audit log để truy vết ai tạo user.
   */
  async createUser(
    actorUserId: string,
    orgId: string,
    input: { email: string; fullName: string; password: string },
  ) {
    const existing = await this.users.findByEmail(input.email);
    if (existing) throw new AppError(409, "Email already registered");

    const created = await this.users.createPublic({
      email: input.email.toLowerCase(),
      fullName: input.fullName,
      passwordHash: await hashPassword(input.password),
      orgId,
    });

    await this.audit.create({
      actorUserId,
      action: "user.create",
      entityType: "user",
      entityId: created.id,
      meta: { email: created.email },
    });

    return created;
  }
}
