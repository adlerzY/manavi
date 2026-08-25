"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser, getPublisherContext } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { GENRE_IMAGE_OPTIONS } from "@/lib/genre-images";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s-]/g, "")
    .replace(/\s+/g, "-");
}

export async function createGenre(input: { name: string; imageUrl?: string }): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getSessionUser();
    if (user?.isBanned) {
      return { success: false, error: "دسترسی غیرمجاز" };
    }
    if (user?.role !== "ADMIN") {
      const context = await getPublisherContext(user);
      if (!context?.canManageComics) return { success: false, error: "دسترسی غیرمجاز" };
    }

    const name = input.name.trim();
    if (!name) {
      return { success: false, error: "نام دسته‌بندی الزامی است" };
    }
    if (input.imageUrl && !GENRE_IMAGE_OPTIONS.some((option) => option.value === input.imageUrl)) {
      return { success: false, error: "تصویر انتخاب‌شده معتبر نیست" };
    }

    const genre = await prisma.genre.create({
      data: { name, slug: slugify(name), imageUrl: input.imageUrl || null },
    });

    revalidateTag("genres", "max");
    revalidatePath("/admin/genres");
    revalidatePath("/admin/comics");
    revalidatePath("/app/explore");
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

    if (!GENRE_IMAGE_OPTIONS.some((option) => option.value === imageUrl)) {
      return { success: false, error: "تصویر انتخاب‌شده معتبر نیست" };
    }

    await prisma.genre.update({ where: { id: genreId }, data: { imageUrl } });

    revalidateTag("genres", "max");
    revalidatePath("/admin/genres");
    revalidatePath("/app/explore");
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
      return { success: false, error: "این دسته‌بندی به عناوینی متصل است و قابل حذف نیست" };
    }

    await prisma.genre.delete({ where: { id: genreId } });

    revalidateTag("genres", "max");
    revalidatePath("/admin/genres");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}