"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { isAllowedImageUrl } from "@/lib/image-url";
import { ENTITY_ID_PATTERN } from "@/lib/asset-kinds";
import type { ReadingDirection, ReadingMode } from "@prisma/client";

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

export async function createCategory(input: {
  id?: string;
  name: string;
  slug?: string;
  imageUrl?: string;
  readingDirection: ReadingDirection;
  defaultReadingMode: ReadingMode;
  showOnHomepage: boolean;
  sortOrder: number;
}): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const name = input.name.trim();
    if (!name) return { success: false, error: "نام دسته‌بندی الزامی است" };

    const slug = slugify(input.slug?.trim() || name);
    if (!slug) return { success: false, error: "اسلاگ نامعتبر است" };

    const draftId = input.id?.trim() || undefined;
    if (draftId) {
      if (!ENTITY_ID_PATTERN.test(draftId)) {
        return { success: false, error: "شناسه‌ی فرم نامعتبر است — صفحه را رفرش کنید" };
      }
      const taken = await prisma.category.findUnique({ where: { id: draftId }, select: { id: true } });
      if (taken) return { success: false, error: "این فرم قبلاً ثبت شده است — صفحه را رفرش کنید" };
    }

    const imageUrl = input.imageUrl?.trim() || null;
    if (imageUrl && !isAllowedImageUrl(imageUrl)) {
      return { success: false, error: INVALID_IMAGE_ERROR };
    }

    const category = await prisma.category.create({
      data: {
        ...(draftId ? { id: draftId } : {}),
        name,
        slug,
        imageUrl,
        readingDirection: input.readingDirection,
        defaultReadingMode: input.defaultReadingMode,
        showOnHomepage: input.showOnHomepage,
        sortOrder: input.sortOrder,
      },
    });

    revalidateTag("categories", "max");
    revalidatePath("/admin/categories");
    revalidatePath("/app");
    revalidatePath("/app/explore");
    return { success: true, data: { id: category.id } };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return { success: false, error: "این اسلاگ یا نام قبلاً استفاده شده — مقدار دیگری انتخاب کنید" };
    }
    return safeError(err);
  }
}

export async function updateCategory(
  categoryId: string,
  input: {
    name: string;
    slug: string;
    imageUrl?: string;
    readingDirection: ReadingDirection;
    defaultReadingMode: ReadingMode;
    showOnHomepage: boolean;
    isActive: boolean;
    sortOrder: number;
  }
): Promise<ActionResult> {
  try {
    await requireAdmin();
    const name = input.name.trim();
    const slug = slugify(input.slug.trim() || name);
    if (!name || !slug) return { success: false, error: "نام و اسلاگ الزامی است" };

    const existing = await prisma.category.findUnique({ where: { id: categoryId }, select: { imageUrl: true } });
    if (!existing) return { success: false, error: "دسته‌بندی یافت نشد" };

    const imageUrl = input.imageUrl?.trim() || null;
    if (imageUrl && imageUrl !== existing.imageUrl && !isAllowedImageUrl(imageUrl)) {
      return { success: false, error: INVALID_IMAGE_ERROR };
    }

    await prisma.category.update({
      where: { id: categoryId },
      data: {
        name,
        slug,
        imageUrl,
        readingDirection: input.readingDirection,
        defaultReadingMode: input.defaultReadingMode,
        showOnHomepage: input.showOnHomepage,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
    });

    revalidateTag("categories", "max");
    revalidatePath("/admin/categories");
    revalidatePath("/app");
    revalidatePath("/app/explore");
    return { success: true };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return { success: false, error: "این اسلاگ یا نام قبلاً استفاده شده — مقدار دیگری انتخاب کنید" };
    }
    return safeError(err);
  }
}

export async function toggleCategoryHomepage(categoryId: string, showOnHomepage: boolean): Promise<ActionResult> {
  try {
    await requireAdmin();
    await prisma.category.update({ where: { id: categoryId }, data: { showOnHomepage } });
    revalidateTag("categories", "max");
    revalidatePath("/admin/categories");
    revalidatePath("/app");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function toggleCategoryActive(categoryId: string, isActive: boolean): Promise<ActionResult> {
  try {
    await requireAdmin();
    await prisma.category.update({ where: { id: categoryId }, data: { isActive } });
    revalidateTag("categories", "max");
    revalidatePath("/admin/categories");
    revalidatePath("/app/explore");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function deleteCategory(categoryId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    const inUse = await prisma.comic.count({ where: { categoryId } });
    if (inUse > 0) {
      return {
        success: false,
        error: `این دسته‌بندی به ${inUse.toLocaleString("fa-IR")} عنوان متصل است و قابل حذف نیست — می‌توانید آن را غیرفعال کنید`,
      };
    }
    await prisma.category.delete({ where: { id: categoryId } });

    try {
      const { deletePrefix } = await import("@/lib/s3");
      await deletePrefix("public", `public/categories/${categoryId}`);
    } catch (cleanupErr) {
      console.error("[category-actions] asset cleanup failed", cleanupErr);
    }

    revalidateTag("categories", "max");
    revalidatePath("/admin/categories");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}