import { Worker } from "bullmq";
import sharp from "sharp";
import { redis } from "../lib/redis.js";
import { FILE_THUMBNAIL_QUEUE } from "../lib/queue.js";
import { getObjectBuffer, putObjectBuffer } from "../lib/s3.js";
import type { FileRepository } from "../repositories/file.repository.js";

export interface ThumbnailJobData {
  fileId: string;
  bucketKey: string;
}

export function thumbnailKeyFor(fileId: string): string {
  return `thumbs/${fileId}.jpg`;
}

export async function processThumbnailJob(
  files: FileRepository,
  data: ThumbnailJobData,
): Promise<string | null> {
  const file = await files.findById(data.fileId);
  if (!file) return null;
  if (!file.mimeType.startsWith("image/")) return null;
  const original = await getObjectBuffer(data.bucketKey);
  const resized = await sharp(original)
    .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  const thumbKey = thumbnailKeyFor(data.fileId);
  await putObjectBuffer(thumbKey, resized, "image/jpeg");
  await files.updateThumbnailKey(data.fileId, thumbKey);
  return thumbKey;
}

export function startThumbnailWorker(files: FileRepository) {
  const worker = new Worker(
    FILE_THUMBNAIL_QUEUE,
    async (job) => processThumbnailJob(files, job.data as ThumbnailJobData),
    { connection: redis },
  );
  worker.on("failed", (job, err) => {
    console.error("thumbnail job failed", job?.id, err);
  });
  return worker;
}
