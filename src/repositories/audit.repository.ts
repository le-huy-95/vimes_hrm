/**
 * AuditRepository — ghi nhật ký hành động (ai làm gì trên entity nào).
 * Dùng chung cho org/team để tránh lặp auditLog.create (DRY).
 */
import type { Prisma } from "@prisma/client";
import { BaseRepository } from "./base.repository.js";

export class AuditRepository extends BaseRepository {
  create(input: {
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    meta?: Prisma.InputJsonValue;
  }) {
    return this.db.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        meta: input.meta,
      },
    });
  }
}
