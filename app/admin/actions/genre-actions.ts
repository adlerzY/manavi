"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { isAllowedImageUrl } from "@/lib/image-url";
import { ENTITY_ID_PATTERN } from "@/lib/asset-kinds";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

const INVALID_IMAGE_ERROR = "آدرس تصویر معتبر نیست — از آپلودگر تصویر استفاده کنید";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s-]/g, "")
    .replace(/\s+/g, "-");
}

function refreshGenreViews() {
  revalidateTag("genres", "max");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/comics");
  revalidatePath("/app/explore");
}

export async function createGenre(input: { id?: string; name: string; imageUrl?: string }): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();

    const name = input.name.trim();
    if (!name) {
      return { success: false, error: "نام ژانر الزامی است" };
    }

    const imageUrl = input.imageUrl?.trim() || null;
    if (imageUrl && !isAllowedImageUrl(imageUrl)) {
      return { success: false, error: INVALID_IMAGE_ERROR };
    }

    const draftId = input.id?.trim() || undefined;
    if (draftId) {
      if (!ENTITY_ID_PATTERN.test(draftId)) {
        return { success: false, error: "شناسه‌ی فرم نامعتبر است — صفحه را رفرش کنید" };
      }
      const taken = await prisma.genre.findUnique({ where: { id: draftId }, select: { id: true } });
      if (taken) return { success: false, error: "این فرم قبلاً ثبت شده است — صفحه را رفرش کنید" };
    }

    const genre = await prisma.genre.create({
      data: { ...(draftId ? { id: draftId } : {}), name, slug: slugify(name), imageUrl },
    });

    refreshGenreViews();
    return { success: true, data: { id: genre.id } };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return { success: false, error: "این نام قبلاً استفاده شده — یک نام دیگر انتخاب کنید" };
    }
    return safeError(err);
  }
}

export async function updateGenreImage(genreId: string, imageUrl: string): Promise<ActionResult> {
  try {
    await requireAdmin();

    if (!isAllowedImageUrl(imageUrl)) {
      return { success: false, error: INVALID_IMAGE_ERROR };
    }

    await prisma.genre.update({ where: { id: genreId }, data: { imageUrl } });

    refreshGenreViews();
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function deleteGenre(genreId: string): Promise<ActionResult> {
  try {
    await requireAdmin();

    const inUse = await prisma.comicGenre.count({ where: { genreId } });
    if (inUse > 0) {
      return { success: false, error: "این ژانر به عناوینی متصل است و قابل حذف نیست" };
    }

    await prisma.genre.delete({ where: { id: genreId } });

    try {
      const { deletePublicPrefix } = await import("@/lib/blob");
      await deletePublicPrefix(`public/genres/${genreId}`);
    } catch (cleanupErr) {
      console.error("[genre-actions] asset cleanup failed", cleanupErr);
    }

    refreshGenreViews();
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}