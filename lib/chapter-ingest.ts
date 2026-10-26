import "server-only";
import { prisma } from "./prisma";
import { ChapterAccessType } from "@prisma/client";
import { LICENSE_STATUS_LABELS_FA } from "./license";
import { getPrimaryEditionId } from "./editions";
import { deleteObjects, listObjectSizes, parsePrivatePageKey, privatePagesPrefix } from "./s3";
import { MAX_PAGE_SIZE_BYTES } from "./page-limits";
import { ENTITY_ID_PATTERN } from "./asset-kinds";

export const MAX_CHAPTER_PAGES = 500;

export interface IngestChapterInput {
  comicId: string;
  editionId?: string | null;
  chapterId?: string | null;
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

type PageKeyCheck = { ok: true; chapterId: string } | { ok: false; error: string };

const INVALID_KEYS_ERROR = "کلید صفحات نامعتبر است — آپلود را دوباره انجام دهید";


function checkPageKeys(comicId: string, editionId: string, expectedChapterId: string | null, pageKeys: string[]): PageKeyCheck {
  const first = parsePrivatePageKey(pageKeys[0]);
  if (!first) return { ok: false, error: INVALID_KEYS_ERROR };

  const chapterId = expectedChapterId ?? first.chapterId;
  if (!ENTITY_ID_PATTERN.test(chapterId)) return { ok: false, error: INVALID_KEYS_ERROR };

  for (let i = 0; i < pageKeys.length; i += 1) {
    const parsed = parsePrivatePageKey(pageKeys[i]);
    if (
      !parsed ||
      parsed.comicId !== comicId ||
      parsed.editionId !== editionId ||
      parsed.chapterId !== chapterId ||
      parsed.index !== i
    ) {
      return { ok: false, error: INVALID_KEYS_ERROR };
    }
  }
  return { ok: true, chapterId };
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

  const keyCheck = checkPageKeys(input.comicId, editionId, input.chapterId ?? null, input.pageKeys);
  if (!keyCheck.ok) return { success: false, error: keyCheck.error };
  const chapterId = keyCheck.chapterId;

  const [sameId, sameNumber] = await Promise.all([
    prisma.chapter.findUnique({ where: { id: chapterId }, select: { id: true } }),
    prisma.chapter.findFirst({ where: { editionId, chapterNumber: input.chapterNumber }, select: { id: true } }),
  ]);
  if (sameId) return { success: false, error: "این آپلود قبلاً ثبت شده است — صفحه را رفرش و دوباره آپلود کنید" };
  if (sameNumber) return { success: false, error: `چپتر ${input.chapterNumber} قبلاً برای این نسخه ثبت شده است` };

  let sizes: Map<string, number>;
  try {
    sizes = await listObjectSizes("private", privatePagesPrefix(input.comicId, editionId, chapterId));
  } catch (err) {
    console.error("[chapter-ingest] listing uploaded pages failed", err);
    return { success: false, error: "بررسی فایل‌های آپلودشده ناموفق بود — دوباره تلاش کنید" };
  }

  const missing = input.pageKeys.filter((key) => !sizes.has(key));
  if (missing.length > 0) {
    return {
      success: false,
      error: `${missing.length.toLocaleString("fa-IR")} صفحه در فضای ذخیره‌سازی پیدا نشد — آپلود را کامل کنید`,
    };
  }

  const invalidSize = input.pageKeys.filter((key) => {
    const size = sizes.get(key) ?? 0;
    return size <= 0 || size > MAX_PAGE_SIZE_BYTES;
  });
  if (invalidSize.length > 0) {
    await deleteObjects(invalidSize).catch(() => {});
    return {
      success: false,
      error: `${invalidSize.length.toLocaleString("fa-IR")} صفحه خالی است یا از ${MAX_PAGE_SIZE_BYTES / 1024 / 1024} مگابایت بزرگ‌تر است — دوباره آپلود کنید`,
    };
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
        id: chapterId,
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

  const wanted = new Set(input.pageKeys);
  const extras = [...sizes.keys()].filter((key) => !wanted.has(key));
  if (extras.length > 0) await deleteObjects(extras).catch(() => {});

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