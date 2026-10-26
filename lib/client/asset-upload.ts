"use client";

import {
  ASSET_KIND_SPECS,
  CLIENT_DIRECT_UPLOAD_MAX_BYTES,
  MAX_UPLOAD_PAYLOAD_BYTES,
  type AssetKind,
} from "@/lib/asset-kinds";

export type AssetUploadPhase = "preparing" | "uploading" | "processing";

export interface UploadAssetResult {
  success: boolean;
  error?: string;
  url?: string;
}

const UPLOAD_ENDPOINT = "/api/assets/upload";
const SEND_STALL_TIMEOUT_MS = 25_000;
const PROCESSING_TIMEOUT_MS = 60_000;
const JPEG_QUALITIES = [0.9, 0.8, 0.7, 0.55];

const STALL_MESSAGE = "ارسال فایل به سرور پاسخی نداد — اتصال اینترنت (یا فیلترشکن) را بررسی کنید و دوباره تلاش کنید.";
const PROCESSING_MESSAGE = "پردازش تصویر در سرور بیش از حد طول کشید — دوباره تلاش کنید.";

class UploadFailure extends Error {}


interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function prepareImage(file: File, kind: AssetKind): Promise<Blob> {
  if (file.size <= CLIENT_DIRECT_UPLOAD_MAX_BYTES) return file;

  const spec = ASSET_KIND_SPECS[kind];
  const decoded = await decodeImage(file);
  try {
    const scale = Math.min(1, spec.maxWidth / decoded.width, spec.maxHeight / decoded.height);
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new UploadFailure("مرورگر از پردازش تصویر پشتیبانی نمی‌کند");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);

    for (const quality of JPEG_QUALITIES) {
      const blob = await canvasToBlob(canvas, "image/jpeg", quality);
      if (blob && blob.size <= CLIENT_DIRECT_UPLOAD_MAX_BYTES) return blob;
    }
    throw new UploadFailure("حجم تصویر حتی پس از بهینه‌سازی بیش از حد مجاز است — تصویر کوچک‌تری انتخاب کنید");
  } finally {
    decoded.release();
  }
}


interface RawResponse {
  status: number;
  body: string;
}

function sendForm(
  form: FormData,
  onProgress: (pct: number) => void,
  onPhase: (phase: AssetUploadPhase) => void
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      action();
    };

    const armTimer = (ms: number, message: string) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(
        () =>
          settle(() => {
            xhr.abort();
            reject(new UploadFailure(message));
          }),
        ms
      );
    };

    xhr.open("POST", UPLOAD_ENDPOINT);
    xhr.setRequestHeader("X-Manavi-Upload", "1");
    xhr.responseType = "text";

    armTimer(SEND_STALL_TIMEOUT_MS, STALL_MESSAGE);

    xhr.upload.onprogress = (event) => {
      armTimer(SEND_STALL_TIMEOUT_MS, STALL_MESSAGE);
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.upload.onload = () => {
      onProgress(100);
      onPhase("processing");
      armTimer(PROCESSING_TIMEOUT_MS, PROCESSING_MESSAGE);
    };
    xhr.onload = () => settle(() => resolve({ status: xhr.status, body: xhr.responseText }));
    xhr.onerror = () =>
      settle(() => reject(new UploadFailure("ارتباط با سرور قطع شد — اینترنت (یا فیلترشکن) را بررسی کنید.")));
    xhr.onabort = () => settle(() => reject(new UploadFailure("آپلود لغو شد.")));

    xhr.send(form);
  });
}


export async function uploadAssetFile(
  kind: AssetKind,
  ownerId: string,
  file: File,
  onProgress?: (pct: number) => void,
  onPhase?: (phase: AssetUploadPhase) => void
): Promise<UploadAssetResult> {
  const spec = ASSET_KIND_SPECS[kind];

  if (!file.type.startsWith("image/")) {
    return { success: false, error: "فقط فایل تصویری (JPG، PNG یا WebP) مجاز است" };
  }
  if (file.size > spec.maxInputBytes) {
    return { success: false, error: `حجم فایل نباید بیش از ${Math.round(spec.maxInputBytes / 1024 / 1024)} مگابایت باشد` };
  }

  onProgress?.(0);
  onPhase?.("preparing");

  let payload: Blob;
  try {
    payload = await prepareImage(file, kind);
  } catch (err) {
    if (err instanceof UploadFailure) return { success: false, error: err.message };
    return { success: false, error: "خواندن یا بهینه‌سازی تصویر ناموفق بود — فایل دیگری امتحان کنید" };
  }

  if (payload.size > MAX_UPLOAD_PAYLOAD_BYTES) {
    return { success: false, error: "حجم تصویر پس از بهینه‌سازی بیش از حد مجاز است" };
  }

  const form = new FormData();
  form.set("kind", kind);
  form.set("ownerId", ownerId);
  form.set("file", payload, file.name || "image");

  onPhase?.("uploading");

  try {
    const { status, body } = await sendForm(form, (pct) => onProgress?.(pct), (phase) => onPhase?.(phase));

    let parsed: { success?: boolean; error?: string; data?: { url?: string } } | null = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }

    if (status >= 200 && status < 300 && parsed?.success && parsed.data?.url) {
      return { success: true, url: parsed.data.url };
    }
    if (status === 413) return { success: false, error: "حجم فایل بیش از حد مجاز است" };
    return { success: false, error: parsed?.error ?? `خطای سرور (${status}) — دوباره تلاش کنید` };
  } catch (err) {
    if (err instanceof UploadFailure) return { success: false, error: err.message };
    return { success: false, error: "آپلود ناموفق بود — دوباره تلاش کنید" };
  }
}