import type { PrismaClient } from "@manage-teams/db";
import { AppError } from "@manage-teams/lib";
import {
  accountTypeFromClaims,
  exchangeAuthorizationCode,
  verifyGoogleIdToken,
  type GoogleIdClaims,
} from "./google-oauth.js";
import { encryptSecret } from "./secret-box.js";

export type GoogleUserRow = {
  id: string;
  email: string;
  token_version: number;
};

async function exchangeAndVerify(opts: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<{ claims: GoogleIdClaims; refreshToken?: string }> {
  try {
    const tokens = await exchangeAuthorizationCode(opts);
    const claims = await verifyGoogleIdToken(tokens.idToken);
    return { claims, refreshToken: tokens.refreshToken };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("Đăng nhập Google thất bại", "GOOGLE_EXCHANGE_FAILED", 401);
  }
}

/** Shared upsert after Google claims are verified (PKCE or id_token). */
export async function upsertGoogleUser(
  db: PrismaClient,
  claims: GoogleIdClaims,
  refreshToken?: string | null,
): Promise<{ user: GoogleUserRow; claims: GoogleIdClaims; created: boolean }> {
  if (!claims.email_verified) {
    throw new AppError("Email Google chưa được xác minh", "GOOGLE_EMAIL_UNVERIFIED", 403);
  }

  const accountType = accountTypeFromClaims(claims);
  const refreshEnc = refreshToken ? encryptSecret(refreshToken) : null;

  const bySub = await db.userGoogleAccount.findUnique({ where: { googleSub: claims.sub } });
  if (bySub) {
    const user = await loadUser(db, bySub.userId);
    await db.userGoogleAccount.update({
      where: { googleSub: claims.sub },
      data: {
        email: claims.email,
        accountType,
        linkedAt: new Date(),
        ...(refreshEnc ? { refreshTokenEnc: refreshEnc } : {}),
      },
    });
    return { user, claims, created: false };
  }

  const byEmail = await db.user.findUnique({ where: { email: claims.email } });
  if (byEmail) {
    throw new AppError(
      "Email đã có tài khoản Vimes. Đăng nhập rồi liên kết Google trong phần cài đặt.",
      "GOOGLE_LINK_REQUIRED",
      409,
    );
  }

  const created = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: claims.email,
        displayName: claims.name ?? null,
        emailVerifiedAt: new Date(),
        passwordHash: null,
      },
    });
    await tx.userGoogleAccount.create({
      data: {
        userId: user.id,
        googleSub: claims.sub,
        email: claims.email,
        accountType,
        refreshTokenEnc: refreshEnc,
        isPrimary: true,
      },
    });
    return user;
  });

  return {
    user: { id: created.id, email: created.email, token_version: created.tokenVersion },
    claims,
    created: true,
  };
}

export async function resolveGoogleLogin(
  db: PrismaClient,
  opts: { code: string; codeVerifier: string; redirectUri: string },
): Promise<{ user: GoogleUserRow; claims: GoogleIdClaims; created: boolean }> {
  const { claims, refreshToken } = await exchangeAndVerify(opts);
  return upsertGoogleUser(db, claims, refreshToken);
}

export async function resolveGoogleIdTokenLogin(
  db: PrismaClient,
  idToken: string,
  refreshToken?: string | null,
): Promise<{ user: GoogleUserRow; claims: GoogleIdClaims; created: boolean }> {
  try {
    const claims = await verifyGoogleIdToken(idToken);
    return upsertGoogleUser(db, claims, refreshToken ?? null);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("Đăng nhập Google thất bại", "GOOGLE_EXCHANGE_FAILED", 401);
  }
}

async function attachGoogleToUser(
  db: PrismaClient,
  userId: string,
  claims: GoogleIdClaims,
  refreshToken?: string | null,
): Promise<{ claims: GoogleIdClaims; tasksSyncReady: boolean; isPrimary: boolean }> {
  if (!claims.email_verified) {
    throw new AppError("Email Google chưa được xác minh", "GOOGLE_EMAIL_UNVERIFIED", 403);
  }

  const bySub = await db.userGoogleAccount.findUnique({ where: { googleSub: claims.sub } });
  if (bySub && bySub.userId !== userId) {
    throw new AppError("Google này đã liên kết với tài khoản Vimes khác", "GOOGLE_TAKEN", 409);
  }

  const existingCount = await db.userGoogleAccount.count({ where: { userId } });
  const user = await loadUser(db, userId);

  // First link: Google email must match Vimes email.
  if (existingCount === 0 && user.email !== claims.email) {
    throw new AppError(
      "Email Google phải trùng email tài khoản Vimes để liên kết",
      "GOOGLE_EMAIL_MISMATCH",
      409,
    );
  }

  const accountType = accountTypeFromClaims(claims);
  const refreshEnc = refreshToken ? encryptSecret(refreshToken) : null;
  const isFirst = existingCount === 0;

  await db.$transaction(async (tx) => {
    await tx.userGoogleAccount.upsert({
      where: { googleSub: claims.sub },
      create: {
        userId,
        googleSub: claims.sub,
        email: claims.email,
        accountType,
        refreshTokenEnc: refreshEnc,
        isPrimary: isFirst,
      },
      update: {
        email: claims.email,
        refreshTokenEnc: refreshEnc ?? undefined,
        accountType,
        linkedAt: new Date(),
      },
    });
    const existing = await tx.user.findUnique({ where: { id: userId } });
    if (existing && !existing.emailVerifiedAt) {
      await tx.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: new Date() },
      });
    }
  });

  const saved = await db.userGoogleAccount.findUnique({ where: { googleSub: claims.sub } });
  return {
    claims,
    tasksSyncReady: Boolean(saved?.refreshTokenEnc),
    isPrimary: Boolean(saved?.isPrimary),
  };
}

export async function linkGoogleToUser(
  db: PrismaClient,
  userId: string,
  opts: { code: string; codeVerifier: string; redirectUri: string },
): Promise<{ claims: GoogleIdClaims; tasksSyncReady: boolean; isPrimary: boolean }> {
  const { claims, refreshToken } = await exchangeAndVerify(opts);
  return attachGoogleToUser(db, userId, claims, refreshToken);
}

/** Link / refresh Google from Flutter Google Sign-In (idToken + optional serverAuthCode). */
export async function linkGoogleToUserWithIdToken(
  db: PrismaClient,
  userId: string,
  idToken: string,
  refreshToken?: string | null,
): Promise<{ claims: GoogleIdClaims; tasksSyncReady: boolean; isPrimary: boolean }> {
  try {
    const claims = await verifyGoogleIdToken(idToken);
    return attachGoogleToUser(db, userId, claims, refreshToken ?? null);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("Liên kết Google thất bại", "GOOGLE_EXCHANGE_FAILED", 401);
  }
}

/**
 * Switch Primary and clear this user's Google bridges (rebind B).
 * Vimes-native tasks/messages are kept.
 */
export async function setGoogleAccountPrimary(
  db: PrismaClient,
  userId: string,
  googleSub: string,
): Promise<{ googleSub: string; email: string | null }> {
  const target = await db.userGoogleAccount.findFirst({
    where: { userId, googleSub },
  });
  if (!target) {
    throw new AppError("Không tìm thấy tài khoản Google", "NOT_FOUND", 404);
  }

  if (target.isPrimary) {
    return { googleSub: target.googleSub, email: target.email };
  }

  const ownedSheets = await db.groupSheet.findMany({
    where: { ownerUserId: userId },
    select: { groupId: true, id: true },
  });
  const groupIds = ownedSheets.map((s) => s.groupId);

  await db.$transaction(async (tx) => {
    await tx.userGoogleAccount.updateMany({
      where: { userId, isPrimary: true },
      data: { isPrimary: false },
    });
    await tx.userGoogleAccount.update({
      where: { googleSub },
      data: {
        isPrimary: true,
        tasksSyncCursor: null,
        tasksLastPullAt: null,
        tasksNextPollAt: null,
        tasksEmptyStreak: 0,
      },
    });

    await tx.googleTaskLink.deleteMany({ where: { userId } });

    if (ownedSheets.length > 0) {
      await tx.groupSheet.updateMany({
        where: { ownerUserId: userId },
        data: {
          spreadsheetId: null,
          driveFileId: null,
          contentHash: null,
          rowHashes: {},
          status: "PENDING",
          lastPushAt: null,
          lastPullAt: null,
        },
      });
      if (groupIds.length > 0) {
        await tx.driveWatchChannel.updateMany({
          where: { groupId: { in: groupIds }, status: "ACTIVE" },
          data: { status: "INACTIVE" },
        });
        await tx.googleChatSpace.updateMany({
          where: { groupId: { in: groupIds } },
          data: { chatIngestEnabled: false, status: "NEEDS_RECONNECT" },
        });
      }
    }

    await tx.syncJob.updateMany({
      where: {
        userId,
        status: { in: ["PENDING", "RETRY", "RUNNING", "AUTH_REQUIRED"] },
      },
      data: {
        status: "FAILED",
        lastError: "Tài khoản Google chính đã đổi — cần liên kết lại",
      },
    });
  });

  return { googleSub: target.googleSub, email: target.email };
}

async function loadUser(db: PrismaClient, userId: string): Promise<GoogleUserRow> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("Chưa xác thực", "UNAUTHORIZED", 401);
  return { id: user.id, email: user.email, token_version: user.tokenVersion };
}
