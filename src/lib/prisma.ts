/**
 * Singleton PrismaClient.
 * Dev mode giữ instance trên globalThis để hot-reload không tạo nhiều kết nối DB.
 */
import { PrismaClient, type Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

/** Kiểu client bên trong prisma.$transaction(...) */
export type DbTx = Prisma.TransactionClient;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
