// lib/s3.ts
import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID, createHmac } from "crypto";


export class StorageNotConfiguredError extends Error {
  constructor(public readonly missing: string[]) {
    super(`تنظیمات فضای ذخیره‌سازی ناقص است. متغیرهای تنظیم‌نشده: ${missing.join("، ")}`);
    this.name = "StorageNotConfiguredError";
  }
}

export class PublicStorageMisconfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicStorageMisconfiguredError";
  }
}

export class StorageCdnMisconfiguredError extends Error {
  constructor() {
    super(
      "STORAGE_CDN_BASE_URL و STORAGE_CDN_TOKEN_KEY باید همزمان تنظیم بشن — الان فقط یکی از این دو ست شده. تا وقتی هر دو کامل نشن، دسترسی به تصاویر از این مسیر شکسته می‌مونه."
    );
    this.name = "StorageCdnMisconfiguredError";
  }
}


export type StorageVisibility = "public" | "private";

const DEFAULT_READ_URL_TTL_SECONDS = 24 * 60 * 60;
const CDN_URL_CACHE_BUCKET_SECONDS = 15 * 60;
const PRESIGN_PUT_TTL_SECONDS = 10 * 60;
const MAX_KEYS_PER_DELETE_REQUEST = 1000;
const PUBLIC_CACHE_CONTROL = "public, max-age=31536000, immutable";

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

export const IMAGE_CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};


function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

let clientInstance: S3Client | null = null;

function getClient(): S3Client {
  if (clientInstance) return clientInstance;

  const accessKeyId = readEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = readEnv("S3_SECRET_ACCESS_KEY");
  const missing: string[] = [];
  if (!accessKeyId) missing.push("S3_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("S3_SECRET_ACCESS_KEY");
  if (!accessKeyId || !secretAccessKey) throw new StorageNotConfiguredError(missing);

  clientInstance = new S3Client({
    region: readEnv("S3_REGION") || "us-east-1",
    endpoint: readEnv("S3_ENDPOINT"),
    forcePathStyle: Boolean(readEnv("S3_ENDPOINT")),
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: { accessKeyId, secretAccessKey },
  });
  return clientInstance;
}

function getPrivateBucket(): string {
  const bucket = readEnv("S3_BUCKET");
  if (!bucket) throw new StorageNotConfiguredError(["S3_BUCKET"]);
  return bucket;
}

interface PublicConfig {
  bucket: string;
  baseUrl: string;
}

function getPublicConfig(): PublicConfig {
  const bucket = readEnv("S3_PUBLIC_BUCKET");
  const rawBase = readEnv("S3_PUBLIC_BASE_URL");

  const missing: string[] = [];
  if (!bucket) missing.push("S3_PUBLIC_BUCKET");
  if (!rawBase) missing.push("S3_PUBLIC_BASE_URL");
  if (!bucket || !rawBase) throw new StorageNotConfiguredError(missing);

  if (bucket === readEnv("S3_BUCKET")) {
    throw new PublicStorageMisconfiguredError(
      "S3_PUBLIC_BUCKET نباید با S3_BUCKET یکی باشد. باکت خصوصی شامل صفحات پولی و بکاپ دیتابیس است و هرگز نباید عمومی شود؛ یک باکت عمومی جدا بساز."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawBase);
  } catch {
    throw new PublicStorageMisconfiguredError("S3_PUBLIC_BASE_URL یک آدرس معتبر نیست.");
  }
  if (parsed.protocol !== "https:") {
    throw new PublicStorageMisconfiguredError("S3_PUBLIC_BASE_URL باید با https:// شروع شود.");
  }

  return { bucket, baseUrl: rawBase.replace(/\/+$/, "") };
}

function tryGetPublicBaseUrl(): string | null {
  const raw = readEnv("S3_PUBLIC_BASE_URL");
  return raw ? raw.replace(/\/+$/, "") : null;
}

interface CdnConfig {
  baseUrl: string;
  tokenKey: string;
}

function getCdnConfig(): CdnConfig | null {
  const baseUrl = readEnv("STORAGE_CDN_BASE_URL");
  const tokenKey = readEnv("STORAGE_CDN_TOKEN_KEY");
  if (!baseUrl && !tokenKey) return null;
  if (!baseUrl || !tokenKey) throw new StorageCdnMisconfiguredError();
  return { baseUrl, tokenKey };
}


function assertSegment(label: string, value: string): void {
  if (!SAFE_SEGMENT.test(value)) {
    throw new Error(`مقدار ${label} برای ساخت مسیر ذخیره‌سازی معتبر نیست`);
  }
}

export function isAllowedPageContentType(contentType: string): boolean {
  return Object.prototype.hasOwnProperty.call(IMAGE_CONTENT_TYPE_EXTENSIONS, contentType);
}

export function privatePagesPrefix(comicId: string, editionId: string, chapterId: string): string {
  assertSegment("comicId", comicId);
  assertSegment("editionId", editionId);
  assertSegment("chapterId", chapterId);
  return `private/comics/${comicId}/editions/${editionId}/chapters/${chapterId}/pages/`;
}

export function buildPrivatePageKey(
  comicId: string,
  editionId: string,
  chapterId: string,
  index: number,
  contentType: string
): string {
  const extension = IMAGE_CONTENT_TYPE_EXTENSIONS[contentType];
  if (!extension) throw new Error(`فرمت فایل پشتیبانی نمی‌شود: ${contentType}`);
  if (!Number.isInteger(index) || index < 0 || index > 9999) throw new Error("شماره صفحه نامعتبر است");
  return `${privatePagesPrefix(comicId, editionId, chapterId)}${String(index).padStart(4, "0")}.${extension}`;
}

export interface ParsedPageKey {
  comicId: string;
  editionId: string;
  chapterId: string;
  index: number;
  extension: string;
}

const PRIVATE_PAGE_KEY_PATTERN =
  /^private\/comics\/([A-Za-z0-9_-]{1,64})\/editions\/([A-Za-z0-9_-]{1,64})\/chapters\/([A-Za-z0-9_-]{1,64})\/pages\/(\d{4})\.(jpg|png|webp)$/;

export function parsePrivatePageKey(key: string): ParsedPageKey | null {
  if (typeof key !== "string") return null;
  const match = PRIVATE_PAGE_KEY_PATTERN.exec(key);
  if (!match) return null;
  return {
    comicId: match[1],
    editionId: match[2],
    chapterId: match[3],
    index: Number(match[4]),
    extension: match[5],
  };
}

export interface PutPublicObjectResult {
  key: string;
  url: string;
}

export async function putPublicObject(key: string, body: Buffer, contentType: string): Promise<PutPublicObjectResult> {
  if (!key.startsWith("public/")) {
    throw new Error("کلید دارایی عمومی باید با public/ شروع شود");
  }
  const { bucket, baseUrl } = getPublicConfig();

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: PUBLIC_CACHE_CONTROL,
    })
  );

  return { key, url: `${baseUrl}/${key}` };
}

async function uploadPublicAvatar(
  scope: "users" | "publishers",
  ownerId: string,
  file: Buffer,
  contentType: string
): Promise<string> {
  assertSegment("ownerId", ownerId);
  const extension = IMAGE_CONTENT_TYPE_EXTENSIONS[contentType];
  if (!extension) throw new Error(`فرمت فایل پشتیبانی نمی‌شود: ${contentType}`);

  const key = `public/${scope}/${ownerId}/avatar/${randomUUID()}.${extension}`;
  const result = await putPublicObject(key, file, contentType);
  return result.url;
}

export function uploadUserAvatar(userId: string, file: Buffer, contentType: string): Promise<string> {
  return uploadPublicAvatar("users", userId, file, contentType);
}

export function uploadPublisherAvatar(publisherId: string, file: Buffer, contentType: string): Promise<string> {
  return uploadPublicAvatar("publishers", publisherId, file, contentType);
}


export async function createPagePresignedPutUrl(
  key: string,
  contentType: string,
  expiresInSec: number = PRESIGN_PUT_TTL_SECONDS
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getPrivateBucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSec });
}


export interface ImageTransformOptions {
  width?: number;
  quality?: number;
}

function bucketedExpiry(ttlSeconds: number): number {
  const now = Math.floor(Date.now() / 1000);
  const minExpiry = now + ttlSeconds;
  return Math.ceil(minExpiry / CDN_URL_CACHE_BUCKET_SECONDS) * CDN_URL_CACHE_BUCKET_SECONDS;
}

function signCdnUrl(cdn: CdnConfig, key: string, expiresInSec: number): string {
  const path = `/${key.replace(/^\/+/, "")}`;
  const expires = bucketedExpiry(expiresInSec);

  const token = `HS256-${createHmac("sha256", cdn.tokenKey).update(`${path}${expires}`).digest("base64url")}`;

  const base = cdn.baseUrl.replace(/\/+$/, "");
  return `${base}${path}?token=${token}&expires=${expires}`;
}

function withImageTransform(url: string, transform?: ImageTransformOptions): string {
  const params = new URLSearchParams();
  params.set("format", "auto");
  if (transform?.width) params.set("width", String(transform.width));
  if (transform?.quality) params.set("quality", String(transform.quality));

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${params.toString()}`;
}

export async function getSignedImageUrl(
  key: string,
  expiresInSec: number = DEFAULT_READ_URL_TTL_SECONDS,
  transform?: ImageTransformOptions
): Promise<string> {
  if (key.startsWith("http://") || key.startsWith("https://")) {
    return key;
  }

  const cdn = getCdnConfig();
  if (cdn) {
    return withImageTransform(signCdnUrl(cdn, key, expiresInSec), transform);
  }

  const command = new GetObjectCommand({ Bucket: getPrivateBucket(), Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSec });
}

export async function getSignedImageUrls(
  keys: string[],
  expiresInSec: number = DEFAULT_READ_URL_TTL_SECONDS,
  transform?: ImageTransformOptions
): Promise<string[]> {
  return Promise.all(keys.map((key) => getSignedImageUrl(key, expiresInSec, transform)));
}


function bucketFor(visibility: StorageVisibility): string {
  return visibility === "public" ? getPublicConfig().bucket : getPrivateBucket();
}


export async function listObjectSizes(visibility: StorageVisibility, prefix: string): Promise<Map<string, number>> {
  const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
  if (!normalized.startsWith(`${visibility}/`)) {
    throw new Error("پیشوند با نوع باکت هماهنگ نیست");
  }
  if (normalized.split("/").filter(Boolean).length < 3) {
    throw new Error("پیشوند فهرست‌گیری بیش از حد کلی است");
  }

  const bucket = bucketFor(visibility);
  const sizes = new Map<string, number>();
  let continuationToken: string | undefined;

  do {
    const page = await getClient().send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: normalized,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );
    for (const object of page.Contents ?? []) {
      if (object.Key) sizes.set(object.Key, Number(object.Size ?? 0));
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return sizes;
}


interface DeleteTarget {
  visibility: StorageVisibility;
  key: string;
}

function resolveTarget(keyOrUrl: string): DeleteTarget | null {
  if (!keyOrUrl) return null;

  if (/^https?:\/\//i.test(keyOrUrl)) {
    const base = tryGetPublicBaseUrl();
    if (!base || !keyOrUrl.startsWith(`${base}/`)) return null;
    const key = keyOrUrl.slice(base.length + 1).split("?")[0];
    return key.startsWith("public/") ? { visibility: "public", key } : null;
  }

  return { visibility: keyOrUrl.startsWith("public/") ? "public" : "private", key: keyOrUrl };
}

async function deleteKeysInBatches(bucket: string, keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += MAX_KEYS_PER_DELETE_REQUEST) {
    const batch = keys.slice(i, i + MAX_KEYS_PER_DELETE_REQUEST);
    await getClient().send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      })
    );
  }
}

export async function deleteObject(keyOrUrl: string): Promise<void> {
  const target = resolveTarget(keyOrUrl);
  if (!target) return;
  await getClient().send(new DeleteObjectCommand({ Bucket: bucketFor(target.visibility), Key: target.key }));
}

export async function deleteObjects(keysOrUrls: string[]): Promise<void> {
  const privateKeys: string[] = [];
  const publicKeys: string[] = [];

  for (const item of keysOrUrls) {
    const target = resolveTarget(item);
    if (!target) continue;
    (target.visibility === "public" ? publicKeys : privateKeys).push(target.key);
  }

  if (privateKeys.length > 0) await deleteKeysInBatches(getPrivateBucket(), privateKeys);
  if (publicKeys.length > 0) await deleteKeysInBatches(getPublicConfig().bucket, publicKeys);
}


export async function deletePrefix(visibility: StorageVisibility, prefix: string): Promise<number> {
  const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
  if (!normalized.startsWith(`${visibility}/`)) {
    throw new Error("پیشوند با نوع باکت هماهنگ نیست");
  }
  if (normalized.split("/").filter(Boolean).length < 3) {
    throw new Error("پیشوند حذف بیش از حد کلی است");
  }

  const bucket = bucketFor(visibility);
  let continuationToken: string | undefined;
  let deleted = 0;

  do {
    const page = await getClient().send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: normalized,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );
    const keys = (page.Contents ?? []).map((object) => object.Key).filter((key): key is string => Boolean(key));
    if (keys.length > 0) {
      await deleteKeysInBatches(bucket, keys);
      deleted += keys.length;
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return deleted;
}