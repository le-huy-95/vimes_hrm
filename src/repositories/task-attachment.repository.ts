import { BaseRepository } from "./base.repository.js";

export class TaskAttachmentRepository extends BaseRepository {
  create(taskId: string, fileId: string) {
    return this.db.taskAttachment.create({ data: { taskId, fileId } });
  }

  findByTask(taskId: string) {
    return this.db.taskAttachment.findMany({
      where: { taskId },
      include: { file: true },
      orderBy: { id: "asc" },
    });
  }

  findOne(taskId: string, fileId: string) {
    return this.db.taskAttachment.findUnique({
      where: { taskId_fileId: { taskId, fileId } },
    });
  }

  delete(taskId: string, fileId: string) {
    return this.db.taskAttachment.delete({
      where: { taskId_fileId: { taskId, fileId } },
    });
  }
}
