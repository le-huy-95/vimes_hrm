import { MinioStorageProvider, type StorageProvider } from "@manage-teams/storage";

let provider: StorageProvider | null = null;

/** Singleton MinIO storage cho chat file uploads. */
export function getStorage(): StorageProvider {
  if (provider) return provider;
  provider = new MinioStorageProvider({
    endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
    secretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
    bucket: process.env.MINIO_BUCKET ?? "manage-teams",
  });
  return provider;
}

export const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES ?? 2 * 1024 * 1024 * 1024);
export const SIGNED_PUT_TTL = Number(process.env.FILE_PUT_TTL_SEC ?? 3600);
export const SIGNED_GET_TTL = Number(process.env.FILE_GET_TTL_SEC ?? 300);

/** MIME nguy hiểm — không cho READY (chống XSS). */
export const BLOCKED_CONTENT_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
]);
