import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env.js";

let client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!client) {
    client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
    });
  }
  return client;
}

export function s3Bucket(): string {
  return env.S3_BUCKET;
}

export async function presignPut(bucketKey: string, mimeType: string, expiresIn = 300): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: s3Bucket(),
    Key: bucketKey,
    ContentType: mimeType,
  });
  return getSignedUrl(getS3Client(), cmd, { expiresIn });
}

export async function presignGet(bucketKey: string, expiresIn = 300): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: s3Bucket(), Key: bucketKey });
  return getSignedUrl(getS3Client(), cmd, { expiresIn });
}

export async function headObject(bucketKey: string) {
  const cmd = new HeadObjectCommand({ Bucket: s3Bucket(), Key: bucketKey });
  return getS3Client().send(cmd);
}

export async function putObjectBuffer(bucketKey: string, body: Buffer, contentType: string) {
  const cmd = new PutObjectCommand({
    Bucket: s3Bucket(),
    Key: bucketKey,
    Body: body,
    ContentType: contentType,
  });
  return getS3Client().send(cmd);
}

export async function getObjectBuffer(bucketKey: string): Promise<Buffer> {
  const cmd = new GetObjectCommand({ Bucket: s3Bucket(), Key: bucketKey });
  const out = await getS3Client().send(cmd);
  const body = out.Body as unknown as AsyncIterable<Uint8Array> | undefined;
  if (!body) throw new Error("Empty S3 object");
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as ArrayBuffer));
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}
