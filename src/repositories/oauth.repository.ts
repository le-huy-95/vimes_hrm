/**
 * OauthRepository — lưu token OAuth đã mã hóa (không lưu plain text).
 */
import type { OAuthProvider, Prisma } from "@prisma/client";
import { BaseRepository } from "./base.repository.js";

export class OauthRepository extends BaseRepository {
  /** Tạo mới hoặc cập nhật kết nối Google của user */
  upsertGoogle(input: {
    userId: string;
    accessTokenEnc: string;
    refreshTokenEnc?: string | null;
    expiresAt?: Date;
    scope?: string;
  }) {
    const provider: OAuthProvider = "google";
    return this.db.oauthConnection.upsert({
      where: {
        userId_provider: { userId: input.userId, provider },
      },
      create: {
        userId: input.userId,
        provider,
        accessTokenEnc: input.accessTokenEnc,
        refreshTokenEnc: input.refreshTokenEnc ?? null,
        expiresAt: input.expiresAt,
        scope: input.scope,
      },
      update: {
        accessTokenEnc: input.accessTokenEnc,
        refreshTokenEnc:
          input.refreshTokenEnc === undefined
            ? undefined
            : input.refreshTokenEnc,
        expiresAt: input.expiresAt,
        scope: input.scope,
      } satisfies Prisma.OauthConnectionUpdateInput,
    });
  }
}
