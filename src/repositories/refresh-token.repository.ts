/**
 * RefreshTokenRepository — chỉ lưu hash của refresh token (không lưu raw).
 */
import { BaseRepository } from "./base.repository.js";

export class RefreshTokenRepository extends BaseRepository {
  create(data: { userId: string; tokenHash: string; expiresAt: Date }) {
    return this.db.refreshToken.create({ data });
  }

  /** Token còn hiệu lực: chưa revoke */
  findActiveByHash(tokenHash: string) {
    return this.db.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
      include: { user: true },
    });
  }

  revoke(id: string) {
    return this.db.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  revokeByHash(tokenHash: string) {
    return this.db.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
