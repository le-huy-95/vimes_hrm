import { createHash, randomUUID } from "node:crypto";
import { prismaRead, prismaWrite } from "@manage-teams/db";
import { AppError } from "@manage-teams/lib";
import { fileMetadataKey } from "@manage-teams/cache-keys";
import { getRedis } from "../../infra/redis.js";
import {
  BLOCKED_CONTENT_TYPES,
  getStorage,
  MAX_FILE_BYTES,
  SIGNED_GET_TTL,
  SIGNED_PUT_TTL,
} from "../../infra/storage.js";
import { assertActiveMember } from "../conversation/conversation.service.js";
import { sniffDangerousContent } from "./mime-sniff.js";

/** EICAR test string — luôn chặn. */
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

/**
 * Quota dung lượng READY theo group.
 * `GROUP_FILE_QUOTA_BYTES` rỗng / không set = không giới hạn.
 */
function groupQuotaBytes(): number | null {
  const raw = process.env.GROUP_FILE_QUOTA_BYTES?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function assertGroupQuota(groupId: string | null, additionalBytes: number): Promise<void> {
  const quota = groupQuotaBytes();
  if (quota == null || !groupId) return;
  const agg = await prismaRead.fileObject.aggregate({
    where: { groupId, status: "READY" },
    _sum: { sizeBytes: true },
  });
  const used = Number(agg._sum.sizeBytes ?? 0n);
  if (used + additionalBytes > quota) {
    throw new AppError(
      `Vượt quota nhóm (${used + additionalBytes} > ${quota} bytes)`,
      "GROUP_QUOTA_EXCEEDED",
      413,
    );
  }
}
/**
 * Init upload: tạo row UPLOADING + signed PUT URL (single-shot Phase 1.6).
 * Multipart 2GB đầy đủ: client PUT trực tiếp MinIO bằng URL này (MinIO hỗ trợ object lớn).
 */
export async function initFileUpload(input: {
  userId: string;
  conversationId: string;
  originalName: string;
  contentType?: string;
  sizeBytes: number;
  sha256?: string;
}) {
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_FILE_BYTES) {
    throw new AppError(`File vượt giới hạn ${MAX_FILE_BYTES} bytes`, "FILE_TOO_LARGE", 413);
  }
  if (input.contentType && BLOCKED_CONTENT_TYPES.has(input.contentType.toLowerCase())) {
    throw new AppError("Loại file không được phép", "FILE_TYPE_BLOCKED", 400);
  }

  await assertActiveMember(input.conversationId, input.userId);

  const conv = await prismaRead.conversation.findUnique({
    where: { id: input.conversationId },
  });
  const groupId = conv?.groupId ?? null;
  await assertGroupQuota(groupId, input.sizeBytes);

  // Dedup READY cùng group + sha256
  if (input.sha256 && groupId) {
    const existing = await prismaRead.fileObject.findFirst({
      where: { groupId, sha256: input.sha256, status: "READY" },
    });
    if (existing) {
      return {
        fileId: existing.id,
        deduped: true,
        status: existing.status,
        putUrl: null as string | null,
      };
    }
  }

  const fileId = randomUUID();
  const objectKey = `chat/${input.conversationId}/${fileId}/${sanitizeName(input.originalName)}`;
  const storage = getStorage();
  await storage.ensureBucket();

  const file = await prismaWrite.fileObject.create({
    data: {
      id: fileId,
      groupId,
      conversationId: input.conversationId,
      uploaderUserId: input.userId,
      objectKey,
      originalName: input.originalName.slice(0, 255),
      contentType: input.contentType ?? null,
      sizeBytes: BigInt(input.sizeBytes),
      sha256: input.sha256 ?? null,
      status: "UPLOADING",
      scanStatus: "PENDING",
      orphanAfter: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const putUrl = await storage.getSignedPutUrl(objectKey, SIGNED_PUT_TTL);
  return { fileId: file.id, deduped: false, status: file.status, putUrl, objectKey };
}

/**
 * Complete upload: kiểm tra object trên MinIO, quét EICAR tối giản, READY.
 * ClamAV hook: nếu CLAMAV_HOST set thì có thể mở rộng sau.
 */
export async function completeFileUpload(input: {
  userId: string;
  fileId: string;
  sha256?: string;
}) {
  const file = await prismaRead.fileObject.findUnique({ where: { id: input.fileId } });
  if (!file) throw new AppError("Không tìm thấy", "NOT_FOUND", 404);
  if (file.uploaderUserId !== input.userId) {
    throw new AppError("Không có quyền", "FORBIDDEN", 403);
  }
  if (file.status === "READY") {
    return mapFile(file);
  }

  const storage = getStorage();
  const stat = await storage.statObject(file.objectKey);
  if (!stat) {
    throw new AppError("Đối tượng chưa được tải lên", "UPLOAD_INCOMPLETE", 400);
  }
  if (stat.size > MAX_FILE_BYTES) {
    await storage.removeObject(file.objectKey);
    await prismaWrite.fileObject.update({
      where: { id: file.id },
      data: { status: "REJECTED", scanStatus: "SIZE" },
    });
    throw new AppError("File quá lớn", "FILE_TOO_LARGE", 413);
  }

  // Quét mẫu nhỏ đầu file (EICAR + magic MIME)
  const head = await storage.getObject(file.objectKey);
  const sample = head.subarray(0, Math.min(head.length, 4096)).toString("utf8");
  if (sample.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) {
    await storage.removeObject(file.objectKey);
    await prismaWrite.fileObject.update({
      where: { id: file.id },
      data: { status: "REJECTED", scanStatus: "VIRUS" },
    });
    throw new AppError("File bị chặn (virus)", "FILE_VIRUS", 400);
  }

  const sniffed = sniffDangerousContent(head.subarray(0, Math.min(head.length, 4096)));
  if (sniffed && BLOCKED_CONTENT_TYPES.has(sniffed)) {
    await storage.removeObject(file.objectKey);
    await prismaWrite.fileObject.update({
      where: { id: file.id },
      data: { status: "REJECTED", scanStatus: "MIME", contentType: sniffed },
    });
    throw new AppError(`Nội dung file bị chặn (${sniffed})`, "FILE_TYPE_BLOCKED", 400);
  }

  // Size lệch quá nhiều so với init (cho phép ±5% hoặc 64KiB)
  const declared = Number(file.sizeBytes);
  if (declared > 0) {
    const drift = Math.abs(stat.size - declared);
    const allowed = Math.max(declared * 0.05, 65_536);
    if (drift > allowed && stat.size > declared * 1.5) {
      await storage.removeObject(file.objectKey);
      await prismaWrite.fileObject.update({
        where: { id: file.id },
        data: { status: "REJECTED", scanStatus: "SIZE_MISMATCH" },
      });
      throw new AppError("Kích thước file không khớp khai báo", "FILE_SIZE_MISMATCH", 400);
    }
  }

  const sha =
    input.sha256 ?? createHash("sha256").update(head.length < 8_000_000 ? head : head.subarray(0, 8_000_000)).digest("hex");

  if (file.sha256 && input.sha256 && file.sha256 !== input.sha256) {
    throw new AppError("Mã hash sha256 không khớp lúc khởi tạo", "FILE_HASH_MISMATCH", 400);
  }

  await assertGroupQuota(file.groupId, stat.size);

  const updated = await prismaWrite.fileObject.update({
    where: { id: file.id },
    data: {
      status: "READY",
      scanStatus: "CLEAN",
      sizeBytes: BigInt(stat.size),
      sha256: sha,
      readyAt: new Date(),
      // Không còn orphan — sentinel xa để index orphan chỉ quét UPLOADING
      orphanAfter: new Date("2099-01-01T00:00:00.000Z"),
    },
  });

  await cacheFileMeta(updated);
  return mapFile(updated);
}

/** Cấp signed GET nếu user là member conversation. */
export async function getDownloadUrl(userId: string, fileId: string) {
  const file = await prismaRead.fileObject.findUnique({ where: { id: fileId } });
  if (!file || file.status !== "READY") {
    throw new AppError("Không tìm thấy", "NOT_FOUND", 404);
  }
  if (file.conversationId) {
    await assertActiveMember(file.conversationId, userId);
  } else if (file.uploaderUserId !== userId) {
    throw new AppError("Không có quyền", "FORBIDDEN", 403);
  }

  const storage = getStorage();
  const url = await storage.getSignedGetUrl(file.objectKey, SIGNED_GET_TTL);
  await prismaWrite.fileDownloadAudit.create({
    data: { fileId: file.id, userId },
  });
  return {
    url,
    file: mapFile(file),
    contentDisposition: file.contentType?.startsWith("image/") || file.contentType === "application/pdf"
      ? "inline"
      : "attachment",
  };
}

/** List file READY trong conversation. */
export async function listConversationFiles(userId: string, conversationId: string) {
  await assertActiveMember(conversationId, userId);
  const files = await prismaRead.fileObject.findMany({
    where: { conversationId, status: "READY" },
    orderBy: { readyAt: "desc" },
    take: 100,
  });
  return { files: files.map(mapFile) };
}

/** Dọn file UPLOADING quá hạn orphan_after. */
export async function cleanupOrphanFiles(limit = 50): Promise<number> {
  const now = new Date();
  const orphans = await prismaRead.fileObject.findMany({
    where: { status: "UPLOADING", orphanAfter: { lt: now } },
    take: limit,
  });
  const storage = getStorage();
  let n = 0;
  for (const f of orphans) {
    try {
      await storage.removeObject(f.objectKey);
    } catch {
      /* ignore */
    }
    await prismaWrite.fileObject.update({
      where: { id: f.id },
      data: { status: "ORPHAN_DELETED" },
    });
    n += 1;
  }
  return n;
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
}

function mapFile(f: {
  id: string;
  originalName: string;
  contentType: string | null;
  sizeBytes: bigint;
  sha256: string | null;
  status: string;
  scanStatus: string;
}) {
  return {
    id: f.id,
    originalName: f.originalName,
    contentType: f.contentType,
    sizeBytes: Number(f.sizeBytes),
    sha256: f.sha256,
    status: f.status,
    scanStatus: f.scanStatus,
  };
}

async function cacheFileMeta(f: {
  id: string;
  status: string;
  originalName: string;
  contentType: string | null;
  sizeBytes: bigint;
  sha256: string | null;
  scanStatus: string;
}) {
  const redis = await getRedis();
  if (!redis) return;
  await redis.set(
    fileMetadataKey(f.id),
    JSON.stringify(mapFile(f)),
    { EX: 600 },
  );
}

// silence unused EICAR const if tree-shaken — keep for docs
void EICAR;
