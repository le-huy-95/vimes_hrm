import { PrismaClient } from "@prisma/client";

/**
 * URL primary (ghi). Ưu tiên DATABASE_URL, fallback POSTGRES_URL / default local.
 */
function resolveWriteUrl(): string {
  return (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    "postgresql://mt:mt@localhost:15432/manage_teams"
  );
}

/**
 * URL đọc (replica). Nếu không set DATABASE_URL_READ thì dùng cùng primary —
 * phase sau chỉ cần đổi env để trỏ replica, không sửa service.
 */
function resolveReadUrl(): string {
  return process.env.DATABASE_URL_READ?.trim() || resolveWriteUrl();
}

type PrismaGlobals = {
  __mtPrismaWrite?: PrismaClient;
  __mtPrismaRead?: PrismaClient;
};

const globalForPrisma = globalThis as unknown as PrismaGlobals;

/** Tạo PrismaClient gắn một connection string cụ thể. */
export function createPrismaClient(databaseUrl = resolveWriteUrl()): PrismaClient {
  process.env.DATABASE_URL = databaseUrl;
  return new PrismaClient({
    log: process.env.PRISMA_LOG === "1" ? ["query", "error", "warn"] : ["error"],
  });
}

/**
 * Client ghi (primary). Mọi create/update/delete/transaction phải dùng client này.
 */
export const prismaWrite: PrismaClient =
  globalForPrisma.__mtPrismaWrite ?? createPrismaClient(resolveWriteUrl());

/**
 * Client đọc (replica hoặc cùng primary). Dùng cho findMany/findUnique/count.
 */
export const prismaRead: PrismaClient =
  globalForPrisma.__mtPrismaRead ??
  (resolveReadUrl() === resolveWriteUrl()
    ? prismaWrite
    : createPrismaClient(resolveReadUrl()));

/**
 * Alias tương thích ngược — mặc định = prismaWrite.
 * Code mới nên dùng prismaWrite / prismaRead rõ ràng.
 */
export const prisma: PrismaClient = prismaWrite;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__mtPrismaWrite = prismaWrite;
  globalForPrisma.__mtPrismaRead = prismaRead;
}

export { PrismaClient, Prisma } from "@prisma/client";
export type {
  Conversation,
  ConversationMember,
  Message,
  User,
  Task,
  Organization,
  Group,
} from "@prisma/client";
