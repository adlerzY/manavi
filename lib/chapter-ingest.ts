import "server-only";
import { prisma } from "./prisma";
import { ChapterAccessType } from "@prisma/client";
import { LICENSE_STATUS_LABELS_FA } from "./license";
import { getPrimaryEditionId } from "./editions";

export const MAX_CHAPTER_PAGES = 500;

export interface IngestChapterInput {
  comicId: string;
  editionId?: string | null;
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

  const editionId = input.editionId ?? (await getPrimaryEditionId(input.comicId));
  if (!editionId) return { success: false, error: "عنوان یافت نشد" };

  const edition = await prisma.edition.findUnique({
    where: { id: editionId },
    select: { workId: true, status: true, license: { select: { status: true } } },
  });
  if (!edition || edition.workId !== input.comicId) return { success: false, error: "نسخه یافت نشد" };
  if (edition.status === "SUSPENDED" || edition.status === "ARCHIVED") {
    return { success: false, error: "این نسخه برای آپلود در دسترس نیست" };
  }
  if (edition.license.status === "EXPIRED" || edition.license.status === "TERMINATED") {
    return { success: false, error: `آپلود ممکن نیست — لایسنس ${LICENSE_STATUS_LABELS_FA[edition.license.status]} است` };
  }

  const duplicate = await prisma.chapter.findFirst({
    where: { editionId, chapterNumber: input.chapterNumber },
    select: { id: true },
  });
  if (duplicate) {
    return { success: false, error: `چپتر ${input.chapterNumber} قبلاً برای این نسخه ثبت شده است` };
  }

  const accessType: ChapterAccessType =
    typeof input.accessType === "string" && input.accessType in ChapterAccessType
      ? (input.accessType as ChapterAccessType)
      : ChapterAccessType.FREE;

  const episode = await prisma.workEpisode.upsert({
    where: { workId_canonicalIndex: { workId: input.comicId, canonicalIndex: input.chapterNumber } },
    update: {},
    create: { workId: input.comicId, canonicalIndex: input.chapterNumber },
    select: { id: true },
  });

  let chapter;
  try {
    chapter = await prisma.chapter.create({
      data: {
        comicId: input.comicId,
        editionId,
        episodeId: episode.id,
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
      return { success: false, error: `چپتر ${input.chapterNumber} قبلاً برای این نسخه ثبت شده است` };
    }
    throw err;
  }

  const comicStaff = await prisma.comicStaff.findMany({
    where: { comicId: input.comicId, OR: [{ editionId }, { editionId: null }] },
    select: { userId: true, roleTitle: true, shareBps: true },
  });

  if (comicStaff.length > 0) {
    await prisma.chapterStaff.createMany({
      data: comicStaff.map((s) => ({
        chapterId: chapter.id,
        userId: s.userId,
        roleTitle: s.roleTitle,
        shareBps: s.shareBps,
      })),
      skipDuplicates: true,
    });
  }

  return { success: true, chapterId: chapter.id };
}