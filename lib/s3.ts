import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID, createHmac } from "crypto";
import type { AssetKind } from "./asset-kinds";

const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
if (!S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
  throw new Error("S3_ACCESS_KEY_ID یا S3_SECRET_ACCESS_KEY تنظیم نشده است.");
}

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: Boolean(process.env.S3_ENDPOINT),
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  },
});

function getS3Bucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("S3_BUCKET تنظیم نشده است.");
  }
  return bucket;
}

const PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL;
const STORAGE_CDN_BASE_URL = process.env.STORAGE_CDN_BASE_URL;
const STORAGE_CDN_TOKEN_KEY = process.env.STORAGE_CDN_TOKEN_KEY;
const DEFAULT_READ_URL_TTL_SECONDS = 24 * 60 * 60;

const CDN_URL_CACHE_BUCKET_SECONDS = 15 * 60;

export class StorageCdnMisconfiguredError extends Error {
  constructor() {
    super(
      "STORAGE_CDN_BASE_URL و STORAGE_CDN_TOKEN_KEY باید همزمان تنظیم بشن — الان فقط یکی از این دو ست شده. تا وقتی هر دو کامل نشن، دسترسی به تصاویر از این مسیر شکسته می‌مونه."
    );
    this.name = "StorageCdnMisconfiguredError";
  }
}

function isCdnConfigured(): boolean {
  return Boolean(STORAGE_CDN_BASE_URL || STORAGE_CDN_TOKEN_KEY);
}

function bucketedExpiry(ttlSeconds: number): number {
  const now = Math.floor(Date.now() / 1000);
  const minExpiry = now + ttlSeconds;
  return Math.ceil(minExpiry / CDN_URL_CACHE_BUCKET_SECONDS) * CDN_URL_CACHE_BUCKET_SECONDS;
}

function signCdnUrl(key: string, expiresInSec: number): string {
  if (!STORAGE_CDN_BASE_URL || !STORAGE_CDN_TOKEN_KEY) {
    throw new StorageCdnMisconfiguredError();
  }

  const path = `/${key.replace(/^\/+/, "")}`;
  const expires = bucketedExpiry(expiresInSec);

  const hashableBase = `${path}${expires}`;
  const token = `HS256-${createHmac("sha256", STORAGE_CDN_TOKEN_KEY)
    .update(hashableBase)
    .digest("base64url")}`;

  const base = STORAGE_CDN_BASE_URL.replace(/\/+$/, "");
  return `${base}${path}?token=${token}&expires=${expires}`;
}

export interface ImageTransformOptions {
  width?: number;
  quality?: number;
}

function withImageTransform(url: string, transform?: ImageTransformOptions): string {
  const params = new URLSearchParams();
  params.set("format", "auto");
  if (transform?.width) params.set("width", String(transform.width));
  if (transform?.quality) params.set("quality", String(transform.quality));

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${params.toString()}`;
}

export class BannerPublicUrlNotConfiguredError extends Error {
  constructor() {
    super(
      "S3_PUBLIC_BASE_URL تنظیم نشده است. تصویر باید همیشه از یک URL دائمی سرو شود (باکت عمومی یا یک Pull Zone عمومی روی CDN)، وگرنه بعد از انقضای لینک امضاشده تصویر می‌شکند. قبل از آپلود این متغیر محیطی را تنظیم کنید."
    );
    this.name = "BannerPublicUrlNotConfiguredError";
  }
}

function extractS3Key(keyOrUrl: string): string {
  if (!keyOrUrl) return keyOrUrl;
  if (PUBLIC_BASE_URL && keyOrUrl.startsWith(PUBLIC_BASE_URL)) {
    const cleanBase = PUBLIC_BASE_URL.replace(/\/$/, "");
    return keyOrUrl.replace(`${cleanBase}/`, "");
  }
  return keyOrUrl;
}

const MAX_KEYS_PER_DELETE_REQUEST = 1000;

export async function uploadComicBanner(
  comicId: string | null,
  file: Buffer,
  contentType: string
): Promise<string> {
  if (!PUBLIC_BASE_URL) {
    throw new BannerPublicUrlNotConfiguredError();
  }

  const extension = contentType.split("/")[1] || "bin";
  const key = comicId
    ? `comics/${comicId}/banner-${randomUUID()}.${extension}`
    : `staging/comics/pending/${randomUUID()}/banner.${extension}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: getS3Bucket(),
      Key: key,
      Body: file,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return `${PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
}

export async function uploadComicCover(
  comicId: string | null,
  file: Buffer,
  contentType: string
): Promise<string> {
  if (!PUBLIC_BASE_URL) {
    throw new BannerPublicUrlNotConfiguredError();
  }

  const extension = contentType.split("/")[1] || "bin";
  const key = comicId
    ? `comics/${comicId}/cover-${randomUUID()}.${extension}`
    : `staging/comics/pending/${randomUUID()}/cover.${extension}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: getS3Bucket(),
      Key: key,
      Body: file,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return `${PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
}

export async function uploadUserAvatar(
  userId: string,
  file: Buffer,
  contentType: string
): Promise<string> {
  if (!PUBLIC_BASE_URL) throw new BannerPublicUrlNotConfiguredError();
  const extension = contentType.split("/")[1] || "bin";
  const key = `users/${userId}/avatar-${randomUUID()}.${extension}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: getS3Bucket(),
      Key: key,
      Body: file,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  return `${PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
}

export async function uploadPublisherAvatar(
  publisherId: string,
  file: Buffer,
  contentType: string
): Promise<string> {
  if (!PUBLIC_BASE_URL) throw new BannerPublicUrlNotConfiguredError();
  const extension = contentType.split("/")[1] || "bin";
  const key = `publishers/${publisherId}/avatar-${randomUUID()}.${extension}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: getS3Bucket(),
      Key: key,
      Body: file,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  return `${PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
}

export async function getSignedImageUrl(
  key: string,
  expiresInSec: number = DEFAULT_READ_URL_TTL_SECONDS,
  transform?: ImageTransformOptions
): Promise<string> {
  if (key.startsWith("http://") || key.startsWith("https://")) {
    return key;
  }

  if (isCdnConfigured()) {
    return withImageTransform(signCdnUrl(key, expiresInSec), transform);
  }

  const command = new GetObjectCommand({ Bucket: getS3Bucket(), Key: key });
  return await getSignedUrl(s3, command, { expiresIn: expiresInSec });
}

export async function getSignedImageUrls(
  keys: string[],
  expiresInSec: number = DEFAULT_READ_URL_TTL_SECONDS,
  transform?: ImageTransformOptions
): Promise<string[]> {
  return Promise.all(keys.map((key) => getSignedImageUrl(key, expiresInSec, transform)));
}

export async function deleteObject(keyOrUrl: string): Promise<void> {
  const key = extractS3Key(keyOrUrl);
  await s3.send(new DeleteObjectCommand({ Bucket: getS3Bucket(), Key: key }));
}

export async function deleteObjects(keysOrUrls: string[]): Promise<void> {
  const realKeys = keysOrUrls
    .map((k) => extractS3Key(k))
    .filter((key) => key && !key.startsWith("http://") && !key.startsWith("https://"));

  if (realKeys.length === 0) return;

  const bucket = getS3Bucket();
  for (let i = 0; i < realKeys.length; i += MAX_KEYS_PER_DELETE_REQUEST) {
    const batch = realKeys.slice(i, i + MAX_KEYS_PER_DELETE_REQUEST);
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      })
    );
  }
}

const ALLOWED_PAGE_CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const PRESIGN_PUT_TTL_SECONDS = 10 * 60;

export function isAllowedPageContentType(contentType: string): boolean {
  return contentType in ALLOWED_PAGE_CONTENT_TYPES;
}

export function buildStagingPageKey(comicId: string, uploadId: string, index: number, contentType: string): string {
  const extension = ALLOWED_PAGE_CONTENT_TYPES[contentType] ?? "bin";
  return `staging/${comicId}/${uploadId}/${index}.${extension}`;
}

export async function createPagePresignedPutUrl(
  key: string,
  contentType: string,
  expiresInSec: number = PRESIGN_PUT_TTL_SECONDS
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getS3Bucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: expiresInSec });
}

export function isAllowedAssetContentType(contentType: string): boolean {
  return contentType in ALLOWED_PAGE_CONTENT_TYPES;
}

export function buildAssetKey(kind: AssetKind, ownerId: string | null, contentType: string): string {
  const extension = ALLOWED_PAGE_CONTENT_TYPES[contentType] ?? "bin";
  return ownerId
    ? `${kind}/${ownerId}/image-${randomUUID()}.${extension}`
    : `staging/${kind}/pending/${randomUUID()}/image.${extension}`;
}

export async function createAssetPresignedPutUrl(
  key: string,
  contentType: string,
  expiresInSec: number = PRESIGN_PUT_TTL_SECONDS
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getS3Bucket(),
    Key: key,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  });
  return getSignedUrl(s3, command, { expiresIn: expiresInSec });
}

export function assetPublicUrl(key: string): string {
  if (!PUBLIC_BASE_URL) throw new BannerPublicUrlNotConfiguredError();
  return `${PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
}