import type { Prisma } from "@prisma/client";
import { BaseRepository } from "./base.repository.js";

export class FileRepository extends BaseRepository {
  findById(id: string) {
    return this.db.file.findUnique({ where: { id } });
  }

  findByBucketKey(bucketKey: string) {
    return this.db.file.findUnique({ where: { bucketKey } });
  }

  create(data: Prisma.FileCreateInput | Prisma.FileUncheckedCreateInput) {
    return this.db.file.create({ data: data as Prisma.FileUncheckedCreateInput });
  }

  updateThumbnailKey(id: string, thumbnailKey: string) {
    return this.db.file.update({ where: { id }, data: { thumbnailKey } });
  }

  findManyByIds(ids: string[]) {
    return this.db.file.findMany({ where: { id: { in: ids } } });
  }
}
