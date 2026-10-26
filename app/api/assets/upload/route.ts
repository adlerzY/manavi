import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getSessionUser, getPublisherContext, requireComicManageAccess, type SessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/moderation";
import {
  ASSET_KIND_SPECS,
  ENTITY_ID_PATTERN,
  MAX_UPLOAD_PAYLOAD_BYTES,
  buildPublicAssetKey,
  isAssetKind,
  type AssetKind,
} from "@/lib/asset-kinds";
import { putPublicObject, PublicStorageMisconfiguredError, StorageNotConfiguredError } from "@/lib/s3";
import { optimizeToWebp, ImageProcessorUnavailableError, UnsupportedImageError } from "@/lib/image-process";

export const runtime = "nodejs";
export const maxDuration = 30;

const UPLOADS_PER_MINUTE = 20;

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // هدر سفارشی X-Manavi-Upload جداگانه الزامی است
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

function isBlobLike(value: unknown): value is Blob {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Blob).arrayBuffer === "function" &&
    typeof (value as Blob).size === "number"
  );
}

async function canUpload(kind: AssetKind, ownerId: string, user: SessionUser): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (kind === "category-image") return false;

  // اثر موجود: دسترسی مدیریت همان ناشر لازم است.
  const comic = await prisma.comic.findUnique({
    where: { id: ownerId },
    select: { license: { select: { publisherId: true } } },
  });
  if (comic) {
    try {
      await requireComicManageAccess(comic.license.publisherId);
      return true;
    } catch {
      return false;
    }
  }

  // اثر هنوز ساخته نشده (draftId): همان شرط ساخت اثر.
  const context = await getPublisherContext(user);
  return Boolean(context?.canManageComics);
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-manavi-upload") !== "1" || !isSameOrigin(req)) {
    return fail(403, "درخواست نامعتبر است");
  }

  const user = await getSessionUser();
  if (!user) return fail(401, "نشست شما منقضی شده — مینی‌اپ را از داخل تلگرام دوباره باز کنید");
  if (user.isBanned) return fail(403, "حساب شما مسدود شده است");

  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_UPLOAD_PAYLOAD_BYTES + 200_000) {
    return fail(413, "حجم فایل بیش از حد مجاز است");
  }

  const allowed = await checkRateLimit(`asset-upload:${user.id}`, UPLOADS_PER_MINUTE);
  if (!allowed) return fail(429, "تعداد درخواست‌ها بیش از حد مجاز است — کمی صبر کنید");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "بدنه‌ی درخواست نامعتبر است");
  }

  const kind = form.get("kind");
  const ownerId = form.get("ownerId");
  const file = form.get("file");

  if (!isAssetKind(kind)) return fail(400, "نوع دارایی نامعتبر است");
  if (typeof ownerId !== "string" || !ENTITY_ID_PATTERN.test(ownerId)) return fail(400, "شناسه‌ی مقصد نامعتبر است");
  if (!isBlobLike(file)) return fail(400, "فایل تصویر یافت نشد");
  if (file.size === 0) return fail(400, "فایل خالی است");
  if (file.size > MAX_UPLOAD_PAYLOAD_BYTES) return fail(413, "حجم فایل بیش از حد مجاز است");

  if (!(await canUpload(kind, ownerId, user))) return fail(403, "دسترسی غیرمجاز");

  const spec = ASSET_KIND_SPECS[kind];

  let optimized;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    optimized = await optimizeToWebp(input, {
      maxWidth: spec.maxWidth,
      maxHeight: spec.maxHeight,
      webpQuality: spec.webpQuality,
    });
  } catch (err) {
    if (err instanceof UnsupportedImageError) return fail(415, err.message);
    if (err instanceof ImageProcessorUnavailableError) return fail(500, err.message);
    console.error("[asset-upload] processing failed", err);
    return fail(500, "پردازش تصویر ناموفق بود — دوباره تلاش کنید");
  }

  const key = buildPublicAssetKey(kind, ownerId, randomUUID(), "webp");

  try {
    const stored = await putPublicObject(key, optimized.data, "image/webp");
    return NextResponse.json(
      {
        success: true,
        data: {
          url: stored.url,
          key: stored.key,
          width: optimized.width,
          height: optimized.height,
          bytes: optimized.data.length,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    if (err instanceof StorageNotConfiguredError || err instanceof PublicStorageMisconfiguredError) {
      console.error("[asset-upload] storage config error:", err.message);
      return fail(503, err.message);
    }
    console.error("[asset-upload] put failed", err);
    return fail(502, "ذخیره‌ی فایل در فضای ذخیره‌سازی ناموفق بود — لاگ سرور را بررسی کنید");
  }
}