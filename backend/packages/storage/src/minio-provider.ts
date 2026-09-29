import * as Minio from "minio";
import type { PutObjectInput, StorageProvider } from "./types.js";

export type MinioConfig = {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
};

export class MinioStorageProvider implements StorageProvider {
  private readonly client: Minio.Client;

  constructor(private readonly config: MinioConfig) {
    this.client = new Minio.Client({
      endPoint: config.endPoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
  }

  async ensureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(this.config.bucket);
    if (!exists) {
      await this.client.makeBucket(this.config.bucket, "us-east-1");
    }
  }

  async putObject(input: PutObjectInput): Promise<void> {
    await this.client.putObject(
      this.config.bucket,
      input.key,
      input.body,
      input.body.length,
      input.contentType ? { "Content-Type": input.contentType } : undefined,
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.config.bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async getSignedGetUrl(key: string, expirySeconds: number): Promise<string> {
    return this.client.presignedGetObject(this.config.bucket, key, expirySeconds);
  }

  async getSignedPutUrl(key: string, expirySeconds: number): Promise<string> {
    return this.client.presignedPutObject(this.config.bucket, key, expirySeconds);
  }

  async removeObject(key: string): Promise<void> {
    await this.client.removeObject(this.config.bucket, key);
  }

  async statObject(key: string): Promise<{ size: number; etag?: string } | null> {
    try {
      const s = await this.client.statObject(this.config.bucket, key);
      return { size: s.size, etag: s.etag };
    } catch {
      return null;
    }
  }
}
