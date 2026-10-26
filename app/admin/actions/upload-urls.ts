"use server";

import { prisma } from "@/lib/prisma";
import { requireUploadAccess } from "@/lib/auth";
import { assertLicenseActive, LicenseInactiveError } from "@/lib/license";
import {
  buildPrivatePageKey,
  createPagePresignedPutUrl,
  isAllowedPageContentType,
  StorageNotConfiguredError,
} from "@/lib/s3";
import { getPrimaryEditionId } from "@/lib/editions";
import { checkRateLimit } from "@/lib/moderation";
import { safeError } from "@/lib/errors";
import { MAX_CHAPTER_PAGES } from "@/lib/chapter-ingest";
import { ENTITY_ID_PATTERN } from "@/lib/asset-kinds";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

interface RequestedFile {
  index: number;
  contentType: string;
}

export interface PageUploadUrl {
  index: number;
  key: string;
  uploadUrl: string;
}

const URL_REQUESTS_PER_MINUTE = 120;


export async function requestPageUploadUrls(input: {
  comicId: string;
  uploadId: string;
  files: RequestedFile[];
}): Promise<ActionResult<{ items: PageUploadUrl[] }>> {
  try {
    if (!input.comicId) return { success: false, error: "comicId الزامی است" };
    if (typeof input.uploadId !== "string" || !ENTITY_ID_PATTERN.test(input.uploadId)) {
      return { success: false, error: "uploadId نامعتبر است" };
    }
    if (!Array.isArray(input.files) || input.files.length === 0) {
      return { success: false, error: "حداقل یک فایل لازم است" };
    }
    if (input.files.length > MAX_CHAPTER_PAGES) {
      return { success: false, error: `چپتر نمی‌تواند بیش از ${MAX_CHAPTER_PAGES} صفحه داشته باشد` };
    }

    const user = await requireUploadAccess(input.comicId);
    await assertLicenseActive(input.comicId);

    const allowed = await checkRateLimit(`page-upload-urls:${user.id}`, URL_REQUESTS_PER_MINUTE);
    if (!allowed) return { success: false, error: "تعداد درخواست‌ها بیش از حد مجاز است — کمی صبر کنید" };

    const editionId = await getPrimaryEditionId(input.comicId);
    if (!editionId) return { success: false, error: "عنوان یافت نشد" };

    const [edition, existingChapter] = await Promise.all([
      prisma.edition.findUnique({ where: { id: editionId }, select: { workId: true, status: true } }),
      prisma.chapter.findUnique({ where: { id: input.uploadId }, select: { id: true } }),
    ]);
    if (!edition || edition.workId !== input.comicId) return { success: false, error: "نسخه یافت نشد" };
    if (edition.status === "SUSPENDED" || edition.status === "ARCHIVED") {
      return { success: false, error: "این نسخه برای آپلود در دسترس نیست" };
    }
    if (existingChapter) {
      return { success: false, error: "این آپلود قبلاً ثبت شده است — صفحه را رفرش و دوباره آپلود کنید" };
    }

    const seenIndexes = new Set<number>();
    for (const file of input.files) {
      if (!Number.isInteger(file.index) || file.index < 0 || file.index >= MAX_CHAPTER_PAGES) {
        return { success: false, error: "شماره صفحه نامعتبر است" };
      }
      if (seenIndexes.has(file.index)) {
        return { success: false, error: "شماره صفحه تکراری است" };
      }
      seenIndexes.add(file.index);
      if (!isAllowedPageContentType(file.contentType)) {
        return { success: false, error: `فرمت فایل پشتیبانی نمی‌شود: ${file.contentType}` };
      }
    }

    const items: PageUploadUrl[] = await Promise.all(
      input.files.map(async (file) => {
        const key = buildPrivatePageKey(input.comicId, editionId, input.uploadId, file.index, file.contentType);
        const uploadUrl = await createPagePresignedPutUrl(key, file.contentType);
        return { index: file.index, key, uploadUrl };
      })
    );

    return { success: true, data: { items } };
  } catch (err) {
    if (err instanceof LicenseInactiveError) {
      return { success: false, error: `آپلود ممکن نیست: ${err.reasonFa}` };
    }
    if (err instanceof StorageNotConfiguredError) {
      console.error("[upload-urls] storage not configured:", err.message);
      return { success: false, error: err.message };
    }
    return safeError(err);
  }
}