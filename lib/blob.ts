
import "server-only";

import { del, list, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";

const STORE_ID_ENV = "MANAVI_PUBLIC_TEST_STORE_ID";
const CACHE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const DELETE_BATCH_SIZE = 1000;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class BlobStorageNotConfiguredError extends Error {
  constructor() {
    super(`${STORE_ID_ENV} تنظیم نشده است.`);
    this.name = "BlobStorageNotConfiguredError";
  }
}

export class PublicBlobMisconfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicBlobMisconfiguredError";
  }
}

function getStoreId(): string {
  const storeId = process.env[STORE_ID_ENV]?.trim();

  if (!storeId) {
    throw new BlobStorageNotConfiguredError();
  }

  return storeId;
}

function assertSafeSegment(label: string, value: string): void {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw new Error(`مقدار ${label} برای ساخت مسیر معتبر نیست`);
  }
}

export interface PutPublicObjectResult {
  key: string;
  url: string;
}

export async function putPublicObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<PutPublicObjectResult> {
  if (!key.startsWith("public/")) {
    throw new PublicBlobMisconfiguredError(
      "کلید تصویر عمومی باید با public/ شروع شود"
    );
  }

  if (!EXTENSIONS[contentType]) {
    throw new PublicBlobMisconfiguredError(
      `فرمت تصویر پشتیبانی نمی‌شود: ${contentType}`
    );
  }

  const blob = await put(key, body, {
    access: "public",
    storeId: getStoreId(),
    contentType,
    addRandomSuffix: false,
    cacheControlMaxAge: CACHE_MAX_AGE_SECONDS,
  });

  return {
    key: blob.pathname,
    url: blob.url,
  };
}

export async function uploadUserAvatar(
  userId: string,
  file: Buffer,
  contentType: string
): Promise<string> {
  assertSafeSegment("userId", userId);

  const extension = EXTENSIONS[contentType];
  if (!extension) throw new Error("فرمت آواتار معتبر نیست");

  const key = `public/users/${userId}/avatar/${randomUUID()}.${extension}`;
  return (await putPublicObject(key, file, contentType)).url;
}

export async function uploadPublisherAvatar(
  publisherId: string,
  file: Buffer,
  contentType: string
): Promise<string> {
  assertSafeSegment("publisherId", publisherId);

  const extension = EXTENSIONS[contentType];
  if (!extension) throw new Error("فرمت آواتار معتبر نیست");

  const key = `public/publishers/${publisherId}/avatar/${randomUUID()}.${extension}`;
  return (await putPublicObject(key, file, contentType)).url;
}

function resolvePublicBlobTarget(value: string): string | null {
  if (value.startsWith("public/")) return value;

  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".public.blob.vercel-storage.com") ||
      !url.pathname.startsWith("/public/")
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export async function deletePublicObjects(
  values: Array<string | null | undefined>
): Promise<number> {
  const storeId = getStoreId();
  const targets = [
    ...new Set(
      values
        .filter((value): value is string => Boolean(value))
        .map(resolvePublicBlobTarget)
        .filter((value): value is string => value !== null)
    ),
  ];

  for (let i = 0; i < targets.length; i += DELETE_BATCH_SIZE) {
    await del(targets.slice(i, i + DELETE_BATCH_SIZE), { storeId });
  }

  return targets.length;
}

export async function deletePublicPrefix(prefix: string): Promise<number> {
  const normalized = prefix.replace(/^\/+|\/+$/g, "");

  if (
    !normalized.startsWith("public/") ||
    normalized.split("/").length < 3
  ) {
    throw new Error("پیشوند حذف بیش از حد کلی یا نامعتبر است");
  }

  const storeId = getStoreId();
  const urls: string[] = [];

  let cursor: string | undefined;

  do {
    const page = await list({
      prefix: `${normalized}/`,
      limit: DELETE_BATCH_SIZE,
      cursor,
      storeId,
    });

    urls.push(...page.blobs.map((blob) => blob.url));

    if (page.hasMore && !page.cursor) {
      throw new Error("ادامه صفحه‌بندی Blob دریافت نشد");
    }

    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  for (let i = 0; i < urls.length; i += DELETE_BATCH_SIZE) {
    await del(urls.slice(i, i + DELETE_BATCH_SIZE), { storeId });
  }

  return urls.length;
}
