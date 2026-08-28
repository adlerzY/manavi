import "server-only";
import { prisma } from "./prisma";
import { ChapterAccessType } from "@prisma/client";
import { LICENSE_STATUS_LABELS_FA } from "./license";

export const MAX_CHAPTER_PAGES = 500;

export interface IngestChapterInput {
  comicId: string;
  chapterNumber: number;
  title?: string | null;
  accessType?: string | null;
  pageKeys: string[];
  uploadedById?: string | null;
}

export interface IngestChapterResult {
  success: boolean;
  error?: string;
  chapterId?: string;
}

function isUniqueConstraintError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002");
}

export async function ingestChapter(input: IngestChapterInput): Promise<IngestChapterResult> {
  if (!input.comicId) return { success: false, error: "comicId الزامی است" };
  if (!Number.isFinite(input.chapterNumber) || input.chapterNumber <= 0) {
    return { success: false, error: "شماره چپتر نامعتبر است" };
  }
  if (input.pageKeys.length === 0) return { success: false, error: "حداقل یک صفحه لازم است" };
  if (input.pageKeys.length > MAX_CHAPTER_PAGES) {
    return { success: false, error: `چپتر نمی‌تواند بیش از ${MAX_CHAPTER_PAGES} صفحه داشته باشد` };
  }

  const comic = await prisma.comic.findUnique({
    where: { id: input.comicId },
    select: { license: { select: { status: true } } },
  });
  if (!comic) return { success: false, error: "عنوان یافت نشد" };
  if (comic.license.status === "EXPIRED" || comic.license.status === "TERMINATED") {
    return { success: false, error: `آپلود ممکن نیست — لایسنس ${LICENSE_STATUS_LABELS_FA[comic.license.status]} است` };
  }

  const duplicate = await prisma.chapter.findFirst({
    where: { comicId: input.comicId, chapterNumber: input.chapterNumber },
    select: { id: true },
  });
  if (duplicate) {
    return { success: false, error: `چپتر ${input.chapterNumber} قبلاً برای این عنوان ثبت شده است` };
  }

  const accessType: ChapterAccessType =
    typeof input.accessType === "string" && input.accessType in ChapterAccessType
      ? (input.accessType as ChapterAccessType)
      : ChapterAccessType.FREE;

  let chapter;
  try {
    chapter = await prisma.chapter.create({
      data: {
        comicId: input.comicId,
        chapterNumber: input.chapterNumber,
        title: input.title?.trim() || null,
        pages: input.pageKeys,
        status: "DRAFT",
        accessType,
        uploadedById: input.uploadedById ?? null,
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return { success: false, error: `چپتر ${input.chapterNumber} قبلاً برای این عنوان ثبت شده است` };
    }
    throw err;
  }

  const comicStaff = await prisma.comicStaff.findMany({
    where: { comicId: input.comicId },
    select: { userId: true, roleTitle: true },
  });

  if (comicStaff.length > 0) {
    await prisma.chapterStaff.createMany({
      data: comicStaff.map((s) => ({
        chapterId: chapter.id,
        userId: s.userId,
        roleTitle: s.roleTitle,
      })),
      skipDuplicates: true,
    });
  }

  return { success: true, chapterId: chapter.id };
}