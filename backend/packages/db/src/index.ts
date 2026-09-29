export { createPool, withTransaction } from "./client.js";
export type { Db } from "./client.js";
export { MIGRATIONS } from "./migrations.js";
/** Dual client CQRS-ready: write = primary, read = replica (hoặc cùng URL). */
export {
  prisma,
  prismaWrite,
  prismaRead,
  createPrismaClient,
  PrismaClient,
  Prisma,
} from "./prisma.js";
export type {
  Conversation,
  ConversationMember,
  Message,
  User,
  Task,
  Organization,
  Group,
} from "./prisma.js";
