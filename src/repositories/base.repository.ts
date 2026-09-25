import type { PrismaClient } from "@prisma/client";
import type { DbTx } from "../lib/prisma.js";

/** Client DB: Prisma gốc hoặc client bên trong $transaction */
export type DbClient = PrismaClient | DbTx;

/**
 * BaseRepository — mọi repository kế thừa lớp này.
 *
 * withTx(tx): tạo bản sao dùng chung transaction
 * (đảm bảo nhiều thao tác commit/rollback cùng lúc).
 */
export abstract class BaseRepository {
  constructor(protected readonly db: DbClient) {}

  /** Repo mới gắn với transaction hiện tại (cùng class, khác db client) */
  withTx(tx: DbTx): this {
    const Ctor = this.constructor as new (db: DbClient) => this;
    return new Ctor(tx);
  }
}
