import { prismaRead, prismaWrite, Prisma } from "@manage-teams/db";
import { AppError } from "@manage-teams/lib";

const PLATFORMS = new Set(["ios", "android", "web", "fcm", "apns"]);

/** Đăng ký / cập nhật device push token. */
export async function upsertDeviceToken(input: {
  userId: string;
  platform: string;
  token: string;
}) {
  const platform = input.platform.trim().toLowerCase();
  const token = input.token.trim();
  if (!PLATFORMS.has(platform)) {
    throw new AppError("Nền tảng không được hỗ trợ", "VALIDATION", 400);
  }
  if (token.length < 8 || token.length > 512) {
    throw new AppError("Token không hợp lệ", "VALIDATION", 400);
  }

  const row = await prismaWrite.deviceToken.upsert({
    where: { userId_token: { userId: input.userId, token } },
    create: { userId: input.userId, platform, token },
    update: { platform, updatedAt: new Date() },
  });
  return { id: row.id, platform: row.platform, token: row.token };
}

/** Xoá token (logout / revoke). */
export async function removeDeviceToken(userId: string, token: string) {
  await prismaWrite.deviceToken.deleteMany({
    where: { userId, token: token.trim() },
  });
  return { ok: true as const };
}

/** Enqueue push job (worker stub xử lý — chưa FCM thật). */
export async function enqueuePushJob(input: {
  userId: string;
  kind: string;
  payload: Prisma.InputJsonValue;
}) {
  const job = await prismaWrite.pushJob.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      payload: input.payload ?? {},
      status: "PENDING",
    },
  });
  return job.id;
}

/** Liệt kê token active của user (debug / worker). */
export async function listDeviceTokens(userId: string) {
  const rows = await prismaRead.deviceToken.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return {
    tokens: rows.map((r) => ({
      id: r.id,
      platform: r.platform,
      token: r.token,
      updatedAt: r.updatedAt,
    })),
  };
}
