"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser, invalidateSessionUserCache } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadUserAvatar } from "@/lib/s3";
import { describeUploadError } from "@/lib/upload-error";
import { assertRealImage, InvalidImageError } from "@/lib/image-validate";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function uploadOwnAvatarAction(formData: FormData): Promise<ActionResult<{ url: string }>> {
  try {
    const user = await getSessionUser();
    if (!user) return { success: false, error: "برای این عملیات باید وارد شوید" };

    const file = formData.get("avatar") as File | null;
    if (!file) return { success: false, error: "فایل تصویر یافت نشد" };
    if (!ALLOWED_TYPES.has(file.type)) return { success: false, error: `فرمت فایل پشتیبانی نمی‌شود: ${file.type}` };
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      return { success: false, error: `حجم فایل نباید بیش از ${MAX_AVATAR_SIZE_BYTES / 1024 / 1024} مگابایت باشد` };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await assertRealImage(buffer);

    const url = await uploadUserAvatar(user.id, buffer, file.type);

    await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: url } });
    await invalidateSessionUserCache(user.id);
    revalidatePath("/app/profile");

    return { success: true, data: { url } };
  } catch (err) {
    if (err instanceof InvalidImageError) return { success: false, error: err.message };
    return { success: false, error: describeUploadError(err) };
  }
}
