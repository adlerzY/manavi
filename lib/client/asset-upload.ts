"use client";

import { requestAssetUploadUrl } from "@/app/actions/asset-upload";
import { maxAssetSizeBytes, type AssetKind } from "@/lib/asset-kinds";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type AssetUploadPhase = "preparing" | "uploading";

export interface UploadAssetResult {
  success: boolean;
  error?: string;
  url?: string;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error("Upload URL request timed out")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

function putWithProgress(url: string, blob: Blob, contentType: string, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.timeout = 120_000;
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.onabort = () => reject(new Error("Upload aborted"));
    xhr.send(blob);
  });
}

export async function uploadAssetFile(
  kind: AssetKind,
  ownerId: string | null,
  file: Blob,
  contentType: string,
  onProgress?: (pct: number) => void,
  onPhase?: (phase: AssetUploadPhase) => void
): Promise<UploadAssetResult> {
  if (!ALLOWED_TYPES.has(contentType)) {
    return { success: false, error: `فرمت فایل پشتیبانی نمی‌شود: ${contentType}` };
  }
  const maxSize = maxAssetSizeBytes(kind);
  if (file.size > maxSize) {
    return { success: false, error: `حجم فایل نباید بیش از ${Math.round(maxSize / 1024 / 1024)} مگابایت باشد` };
  }

  onPhase?.("preparing");
  let target: Awaited<ReturnType<typeof requestAssetUploadUrl>>;
  try {
    target = await withTimeout(
      requestAssetUploadUrl({ kind, ownerId, contentType, sizeBytes: file.size }),
      30_000
    );
  } catch {
    return { success: false, error: "دریافت لینک آپلود از سرور ناموفق بود؛ تنظیمات سرویس ذخیره‌سازی و لاگ Vercel را بررسی کنید." };
  }
  if (!target.success || !target.data) {
    return { success: false, error: target.error ?? "خطا در آماده‌سازی آپلود" };
  }

  onPhase?.("uploading");
  try {
    await putWithProgress(target.data.uploadUrl, file, contentType, onProgress);
  } catch (err) {
    const status = err instanceof Error ? err.message.match(/Upload failed with status (\d{3})/)?.[1] : undefined;
    if (status) {
      return { success: false, error: `فضای ذخیره‌سازی آپلود را با خطای HTTP ${status} رد کرد؛ مجوز باکت و تنظیمات CORS را بررسی کنید.` };
    }
    return { success: false, error: "ارتباط با فضای ذخیره‌سازی ناموفق بود یا آپلود بیش از حد طول کشید؛ دوباره تلاش کنید." };
  }

  return { success: true, url: target.data.publicUrl };
}
