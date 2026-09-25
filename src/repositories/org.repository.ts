/**
 * OrgRepository — bảng organizations.
 */
import { BaseRepository } from "./base.repository.js";

export class OrgRepository extends BaseRepository {
  findById(id: string) {
    return this.db.organization.findUnique({ where: { id } });
  }

  create(data: { name: string; domain?: string | null }) {
    return this.db.organization.create({ data });
  }

  update(
    id: string,
    data: { name?: string; domain?: string | null },
  ) {
    return this.db.organization.update({
      where: { id },
      data,
    });
  }
}
