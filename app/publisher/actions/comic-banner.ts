"use server";

import { getSessionUser, getPublisherContext, requireComicManageAccessByComicId } from "@/lib/auth";
import { uploadComicBanner, uploadComicCover } from "@/lib/s3";
import { describeUploadError } from "@/lib/upload-error";
import { assertRealImage, InvalidImageError } from "@/lib/image-validate";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

const MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function readComicId(formData: FormData): string | null {
  const raw = formData.get("comicId");
  return typeof raw === "string" && raw ? raw : null;
}

async function assertAccess(comicId: string | null): Promise<void> {
  if (comicId) {
    await requireComicManageAccessByComicId(comicId);
    return;
  }
  const user = await getSessionUser();
  if (user?.isBanned) {
    throw new Error("Account is banned");
  }
  const context = await getPublisherContext(user);
  if (!context?.canManageComics) {
    throw new Error("دسترسی غیرمجاز");
  }
}

export async function uploadComicBannerAsPublisherAction(formData: FormData): Promise<ActionResult<{ url: string }>> {
  try {
    const comicId = readComicId(formData);
    const file = formData.get("banner") as File | null;

    if (!file) return { success: false, error: "فایل بنر یافت نشد" };
    if (!ALLOWED_TYPES.has(file.type)) return { success: false, error: `فرمت فایل پشتیبانی نمی‌شود: ${file.type}` };
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return { success: false, error: `حجم فایل نباید بیش از ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024} مگابایت باشد` };
    }

    await assertAccess(comicId);

    const buffer = Buffer.from(await file.arrayBuffer());
    await assertRealImage(buffer);

    const url = await uploadComicBanner(comicId, buffer, file.type);

    return { success: true, data: { url } };
  } catch (err) {
    if (err instanceof InvalidImageError) return { success: false, error: err.message };
    return { success: false, error: describeUploadError(err) };
  }
}

export async function uploadComicCoverAsPublisherAction(formData: FormData): Promise<ActionResult<{ url: string }>> {
  try {
    const comicId = readComicId(formData);
    const file = formData.get("cover") as File | null;

    if (!file) return { success: false, error: "فایل کاور یافت نشد" };
    if (!ALLOWED_TYPES.has(file.type)) return { success: false, error: `فرمت فایل پشتیبانی نمی‌شود: ${file.type}` };
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return { success: false, error: `حجم فایل نباید بیش از ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024} مگابایت باشد` };
    }

    await assertAccess(comicId);

    const buffer = Buffer.from(await file.arrayBuffer());
    await assertRealImage(buffer);

    const url = await uploadComicCover(comicId, buffer, file.type);

    return { success: true, data: { url } };
  } catch (err) {
    if (err instanceof InvalidImageError) return { success: false, error: err.message };
    return { success: false, error: describeUploadError(err) };
  }
}