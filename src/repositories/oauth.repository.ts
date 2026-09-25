/**
 * OauthRepository — lưu token OAuth đã mã hóa (không lưu plain text).
 */
import type { OAuthProvider, Prisma } from "@prisma/client";
import { BaseRepository } from "./base.repository.js";

export class OauthRepository extends BaseRepository {
  findByUserAndProvider(userId: string, provider: OAuthProvider) {
    return this.db.oauthConnection.findUnique({
      where: { userId_provider: { userId, provider } },
    });
  }

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

  upsertWorkspace(input: {
    userId: string;
    accessTokenEnc: string;
    refreshTokenEnc?: string | null;
    expiresAt?: Date;
    scope?: string;
  }) {
    const provider: OAuthProvider = "google_workspace";
    return this.db.oauthConnection.upsert({
      where: { userId_provider: { userId: input.userId, provider } },
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
          input.refreshTokenEnc === undefined ? undefined : input.refreshTokenEnc,
        expiresAt: input.expiresAt,
        scope: input.scope,
      } satisfies Prisma.OauthConnectionUpdateInput,
    });
  }

  async findWorkspaceForOrg(orgId: string, preferredUserId?: string) {
    const provider: OAuthProvider = "google_workspace";
    if (preferredUserId) {
      const own = await this.db.oauthConnection.findUnique({
        where: { userId_provider: { userId: preferredUserId, provider } },
        include: { user: true },
      });
      if (own && own.user.orgId === orgId) return own;
    }
    return this.db.oauthConnection.findFirst({
      where: { provider, user: { orgId } },
      orderBy: { userId: "asc" },
    });
  }

  upsertGoogleTasks(input: {
    userId: string;
    accessTokenEnc: string;
    refreshTokenEnc?: string | null;
    expiresAt?: Date;
    scope?: string;
  }) {
    const provider: OAuthProvider = "google_tasks";
    return this.db.oauthConnection.upsert({
      where: { userId_provider: { userId: input.userId, provider } },
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

  findGoogleTasks(userId: string) {
    return this.findByUserAndProvider(userId, "google_tasks");
  }
}
