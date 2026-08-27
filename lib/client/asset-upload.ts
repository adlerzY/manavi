"use client";

import { requestAssetUploadUrl } from "@/app/actions/asset-upload";
import { maxAssetSizeBytes, type AssetKind } from "@/lib/asset-kinds";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface UploadAssetResult {
  success: boolean;
  error?: string;
  url?: string;
}

function putWithProgress(url: string, blob: Blob, contentType: string, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(blob);
  });
}

export async function uploadAssetFile(
  kind: AssetKind,
  ownerId: string | null,
  file: Blob,
  contentType: string,
  onProgress?: (pct: number) => void
): Promise<UploadAssetResult> {
  if (!ALLOWED_TYPES.has(contentType)) {
    return { success: false, error: `فرمت فایل پشتیبانی نمی‌شود: ${contentType}` };
  }
  const maxSize = maxAssetSizeBytes(kind);
  if (file.size > maxSize) {
    return { success: false, error: `حجم فایل نباید بیش از ${Math.round(maxSize / 1024 / 1024)} مگابایت باشد` };
  }

  const target = await requestAssetUploadUrl({ kind, ownerId, contentType, sizeBytes: file.size });
  if (!target.success || !target.data) {
    return { success: false, error: target.error ?? "خطا در آماده‌سازی آپلود" };
  }

  try {
    await putWithProgress(target.data.uploadUrl, file, contentType, onProgress);
  } catch {
    return { success: false, error: "خطا در آپلود فایل — لطفاً دوباره تلاش کنید" };
  }

  return { success: true, url: target.data.publicUrl };
}