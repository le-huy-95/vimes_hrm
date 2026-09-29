export type PutObjectInput = {
  key: string;
  body: Buffer;
  contentType?: string;
};

export type StorageProvider = {
  ensureBucket(): Promise<void>;
  putObject(input: PutObjectInput): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  /** URL ký để client tải xuống (GET). */
  getSignedGetUrl(key: string, expirySeconds: number): Promise<string>;
  /** URL ký để client upload (PUT) — Phase 1.6 single-shot. */
  getSignedPutUrl(key: string, expirySeconds: number): Promise<string>;
  /** Xoá object (dọn orphan). */
  removeObject(key: string): Promise<void>;
  /** Kiểm tra object tồn tại + size. */
  statObject(key: string): Promise<{ size: number; etag?: string } | null>;
};
