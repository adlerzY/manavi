"use server";

import { requireUploadAccess } from "@/lib/auth";
import { assertLicenseActive, LicenseInactiveError } from "@/lib/license";
import { buildStagingPageKey, createPagePresignedPutUrl, isAllowedPageContentType } from "@/lib/s3";
import { safeError } from "@/lib/errors";
import { MAX_CHAPTER_PAGES } from "@/lib/chapter-ingest";

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

export async function requestPageUploadUrls(input: {
  comicId: string;
  uploadId: string;
  files: RequestedFile[];
}): Promise<ActionResult<{ items: PageUploadUrl[] }>> {
  try {
    if (!input.comicId) return { success: false, error: "comicId الزامی است" };
    if (!input.uploadId || !/^[a-f0-9-]{10,64}$/i.test(input.uploadId)) {
      return { success: false, error: "uploadId نامعتبر است" };
    }
    if (input.files.length === 0) return { success: false, error: "حداقل یک فایل لازم است" };
    if (input.files.length > MAX_CHAPTER_PAGES) {
      return { success: false, error: `چپتر نمی‌تواند بیش از ${MAX_CHAPTER_PAGES} صفحه داشته باشد` };
    }

    await requireUploadAccess(input.comicId);
    await assertLicenseActive(input.comicId);

    const seenIndexes = new Set<number>();
    for (const file of input.files) {
      if (!Number.isInteger(file.index) || file.index < 0) {
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
        const key = buildStagingPageKey(input.comicId, input.uploadId, file.index, file.contentType);
        const uploadUrl = await createPagePresignedPutUrl(key, file.contentType);
        return { index: file.index, key, uploadUrl };
      })
    );

    return { success: true, data: { items } };
  } catch (err) {
    if (err instanceof LicenseInactiveError) {
      return { success: false, error: `آپلود ممکن نیست: ${err.reasonFa}` };
    }
    return safeError(err);
  }
}