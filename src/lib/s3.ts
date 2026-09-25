import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Optional AWS S3 storage for uploads. Enabled when S3_BUCKET, S3_REGION,
 * S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are set (Vercel reserves the
 * AWS_* names, hence the S3_ prefix). S3_ENDPOINT is only needed for
 * S3-compatible services (MinIO, Cloudflare R2, …).
 *
 * Without them, uploads keep going into Postgres (4 MB limit).
 */

/** With S3, files go browser → S3 directly, so Vercel's 4.5 MB body limit doesn't apply. */
export const S3_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** Presigned upload/download links stay valid this long. */
const UPLOAD_URL_TTL = 15 * 60;
const DOWNLOAD_URL_TTL = 10 * 60;

export function s3Configured(): boolean {
  return !!(
    process.env.S3_BUCKET &&
    process.env.S3_REGION &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY
  );
}

const globalForS3 = globalThis as unknown as { s3Client: S3Client | undefined };

// Created lazily, like the Postgres pool in db.ts, so `next build` works
// before the S3 settings exist.
function client(): S3Client {
  if (!s3Configured()) throw new Error("S3_NOT_CONFIGURED");
  if (!globalForS3.s3Client) {
    globalForS3.s3Client = new S3Client({
      region: process.env.S3_REGION,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
    });
  }
  return globalForS3.s3Client;
}

const bucket = () => process.env.S3_BUCKET!;

/**
 * Uploads land under tmp/ first and are only moved to files/ once the
 * server has checked them — so a bucket lifecycle rule can expire anything
 * left in tmp/ by abandoned uploads.
 */
export const TMP_KEY = /^tmp\/[0-9a-f-]{36}\/[^/]{1,200}$/;

export function safeKeyName(filename: string): string {
  return (
    filename
      .normalize("NFKD")
      .replace(/[^\w.\- ]+/g, "")
      .replace(/\s+/g, "-")
      .replace(/^[-.]+/, "")
      .slice(0, 150) || "file"
  );
}

export async function presignUpload(key: string, contentType: string, size: number): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType, ContentLength: size }),
    // Signing these means S3 rejects a PUT with a different type or size.
    { expiresIn: UPLOAD_URL_TTL, signableHeaders: new Set(["content-type", "content-length"]) }
  );
}

export async function presignDownload(
  key: string,
  opts: { filename: string; contentType: string; download: boolean }
): Promise<string> {
  const disposition = `${opts.download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(opts.filename)}`;
  return getSignedUrl(
    client(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: disposition,
      ResponseContentType: opts.contentType,
    }),
    { expiresIn: DOWNLOAD_URL_TTL }
  );
}

/** Size of an object, or null if it doesn't exist. */
export async function objectSize(key: string): Promise<number | null> {
  try {
    const head = await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return head.ContentLength ?? 0;
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || status === 403) return null;
    throw e;
  }
}

/** Reads the whole object, or just its first `bytes` bytes. */
export async function readObject(key: string, bytes?: number): Promise<Buffer> {
  const res = await client().send(
    new GetObjectCommand({ Bucket: bucket(), Key: key, ...(bytes ? { Range: `bytes=0-${bytes - 1}` } : {}) })
  );
  return Buffer.from(await res.Body!.transformToByteArray());
}

/** Moves a checked upload from tmp/ to its permanent key. */
export async function promoteObject(fromKey: string, toKey: string, contentType: string): Promise<void> {
  await client().send(
    new CopyObjectCommand({
      Bucket: bucket(),
      Key: toKey,
      CopySource: `${bucket()}/${fromKey.split("/").map(encodeURIComponent).join("/")}`,
      ContentType: contentType,
      MetadataDirective: "REPLACE",
    })
  );
  await deleteObject(fromKey);
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** Best-effort bulk delete (used when documents are deleted). Never throws. */
export async function deleteObjectsQuietly(keys: string[]): Promise<void> {
  if (!keys.length || !s3Configured()) return;
  try {
    for (let i = 0; i < keys.length; i += 1000) {
      await client().send(
        new DeleteObjectsCommand({
          Bucket: bucket(),
          Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
        })
      );
    }
  } catch (e) {
    console.error("Failed to delete S3 objects", e);
  }
}
