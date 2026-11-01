"use client";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_DIRECT_BYTES = 3_500_000;
const MAX_DIMENSION = 2400;
const QUALITIES = [0.85, 0.72, 0.6, 0.45];
const REQUEST_TIMEOUT_MS = 60_000;

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {}
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function prepare(file: File): Promise<Blob | null> {
  if (file.size <= MAX_DIRECT_BYTES) return file;

  const decoded = await decode(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / decoded.width, MAX_DIMENSION / decoded.height);
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);

    for (const quality of QUALITIES) {
      const blob = await toBlob(canvas, quality);
      if (blob && blob.size <= MAX_DIRECT_BYTES) return blob;
    }
    return null;
  } finally {
    decoded.release();
  }
}

export interface ReceiptUploadResult {
  success: boolean;
  error?: string;
  code?: string;
}

export async function uploadWithdrawalReceipt(input: {
  withdrawalId: string;
  file: File;
  reference?: string;
  note?: string;
}): Promise<ReceiptUploadResult> {
  if (!ALLOWED_TYPES.includes(input.file.type)) {
    return { success: false, error: "فقط تصویر با فرمت JPG، PNG یا WebP پذیرفته می‌شود" };
  }

  let payload: Blob | null;
  try {
    payload = await prepare(input.file);
  } catch {
    return { success: false, error: "خواندن تصویر رسید ناموفق بود — فایل دیگری امتحان کنید" };
  }
  if (!payload) return { success: false, error: "حجم تصویر پس از بهینه‌سازی هم زیاد است — تصویر کوچک‌تری انتخاب کنید" };

  const form = new FormData();
  form.set("receipt", payload, input.file.name || "receipt");
  if (input.reference) form.set("reference", input.reference);
  if (input.note) form.set("note", input.note);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`/api/admin/withdrawals/${input.withdrawalId}/pay`, {
      method: "POST",
      headers: { "X-Manavi-Upload": "1" },
      body: form,
      signal: controller.signal,
    });

    let parsed: { success?: boolean; error?: string; data?: { code?: string } } | null = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }

    if (response.ok && parsed?.success) return { success: true, code: parsed.data?.code };
    return { success: false, error: parsed?.error ?? `خطای سرور (${response.status}) — دوباره تلاش کنید` };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { success: false, error: "ارسال رسید بیش از حد طول کشید — اتصال را بررسی و دوباره تلاش کنید" };
    }
    return { success: false, error: "ارتباط با سرور برقرار نشد — اینترنت (یا فیلترشکن) را بررسی کنید" };
  } finally {
    clearTimeout(timer);
  }
}