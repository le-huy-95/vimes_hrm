import { randomUUID } from "node:crypto";
import type { FileEntityType } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { env } from "../lib/env.js";
import { headObject, presignGet, presignPut } from "../lib/s3.js";
import { fileThumbnailQueue } from "../lib/queue.js";
import type { FileRepository } from "../repositories/file.repository.js";
import type { TaskAttachmentRepository } from "../repositories/task-attachment.repository.js";
import type { TaskRepository } from "../repositories/task.repository.js";
import type { UserRepository } from "../repositories/user.repository.js";
import type { ConfirmBody, PresignBody } from "../validators/file.validators.js";

function extFor(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "application/pdf") return "pdf";
  return "bin";
}

export class FileService {
  constructor(
    private readonly files: FileRepository,
    private readonly attachments: TaskAttachmentRepository,
    private readonly tasks: TaskRepository,
    private readonly users: UserRepository,
  ) {}

  async presign(uploaderId: string, orgId: string, input: PresignBody) {
    if (input.sizeBytes > env.FILE_MAX_BYTES) {
      throw new AppError(400, `File too large (max ${env.FILE_MAX_BYTES} bytes)`);
    }
    const safeName = input.originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const bucketKey = `orgs/${orgId}/${input.entityType}/${randomUUID()}-${safeName || `file.${extFor(input.mimeType)}`}`;
    const uploadUrl = await presignPut(bucketKey, input.mimeType);
    return { uploadUrl, bucketKey, headers: { "Content-Type": input.mimeType } };
  }

  async confirm(uploaderId: string, orgId: string, input: ConfirmBody) {
    if (input.sizeBytes > env.FILE_MAX_BYTES) {
      throw new AppError(400, "File too large");
    }
    let head;
    try {
      head = await headObject(input.bucketKey);
    } catch {
      throw new AppError(400, "Object not found in storage — upload first");
    }
    if (head.ContentLength !== undefined && head.ContentLength !== input.sizeBytes) {
      throw new AppError(400, "Size mismatch with uploaded object");
    }
    const file = await this.files.create({
      uploaderId,
      orgId,
      bucketKey: input.bucketKey,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      entityType: input.entityType as FileEntityType,
      entityId: input.entityId ?? null,
      status: "confirmed",
    });
    if (input.entityType === "avatar") {
      await this.users.updateAvatarFile(uploaderId, file.id);
    }
    if (input.mimeType.startsWith("image/")) {
      await fileThumbnailQueue.add("thumbnail", {
        fileId: file.id,
        bucketKey: file.bucketKey,
      });
    }
    return file;
  }

  async getFile(orgId: string, fileId: string) {
    const file = await this.files.findById(fileId);
    if (!file || file.orgId !== orgId) throw new AppError(404, "File not found");
    const downloadUrl = await presignGet(file.bucketKey);
    const thumbnailUrl = file.thumbnailKey ? await presignGet(file.thumbnailKey) : null;
    return { file, downloadUrl, thumbnailUrl };
  }

  async setAvatar(userId: string, orgId: string, fileId: string) {
    const file = await this.files.findById(fileId);
    if (!file || file.orgId !== orgId) throw new AppError(404, "File not found");
    await this.users.updateAvatarFile(userId, fileId);
    return file;
  }

  private async assertTask(teamId: string, taskId: string) {
    const task = await this.tasks.findById(taskId);
    if (!task || task.project.teamId !== teamId) throw new AppError(404, "Task not found");
    return task;
  }

  async attachToTask(orgId: string, teamId: string, taskId: string, fileId: string) {
    await this.assertTask(teamId, taskId);
    const file = await this.files.findById(fileId);
    if (!file || file.orgId !== orgId) throw new AppError(404, "File not found");
    const existing = await this.attachments.findOne(taskId, fileId);
    if (existing) return existing;
    return this.attachments.create(taskId, fileId);
  }

  async listTaskAttachments(orgId: string, teamId: string, taskId: string) {
    await this.assertTask(teamId, taskId);
    const rows = await this.attachments.findByTask(taskId);
    return rows.filter((r) => r.file.orgId === orgId);
  }

  async detachFromTask(orgId: string, teamId: string, taskId: string, fileId: string) {
    await this.assertTask(teamId, taskId);
    const existing = await this.attachments.findOne(taskId, fileId);
    if (!existing) throw new AppError(404, "Attachment not found");
    await this.attachments.delete(taskId, fileId);
  }
}
