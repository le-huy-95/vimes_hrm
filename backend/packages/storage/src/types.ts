export type PutObjectInput = {
  key: string;
  body: Buffer;
  contentType?: string;
};

export type StorageProvider = {
  ensureBucket(): Promise<void>;
  putObject(input: PutObjectInput): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  getSignedGetUrl(key: string, expirySeconds: number): Promise<string>;
};
