import "server-only";

export class UnsupportedImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedImageError";
  }
}

export class ImageProcessorUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageProcessorUnavailableError";
  }
}

const ALLOWED_INPUT_FORMATS = new Set(["jpeg", "png", "webp"]);
const MAX_INPUT_PIXELS = 60_000_000;

export interface OptimizeOptions {
  maxWidth: number;
  maxHeight: number;
  webpQuality: number;
}

export interface OptimizedImage {
  data: Buffer;
  width: number;
  height: number;
}

async function loadSharp() {
  try {
    return (await import("sharp")).default;
  } catch (err) {
    console.error("[image-process] sharp unavailable", err);
    throw new ImageProcessorUnavailableError("پردازشگر تصویر روی سرور در دسترس نیست");
  }
}

export async function optimizeToWebp(input: Buffer, options: OptimizeOptions): Promise<OptimizedImage> {
  const sharp = await loadSharp();

  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });
    const meta = await image.metadata();

    if (!meta.format || !ALLOWED_INPUT_FORMATS.has(meta.format)) {
      throw new UnsupportedImageError("فرمت تصویر پشتیبانی نمی‌شود (فقط JPG، PNG یا WebP)");
    }

    const result = await image
      .rotate()
      .resize({ width: options.maxWidth, height: options.maxHeight, fit: "inside", withoutEnlargement: true })
      .webp({ quality: options.webpQuality })
      .toBuffer({ resolveWithObject: true });

    return { data: result.data, width: result.info.width, height: result.info.height };
  } catch (err) {
    if (err instanceof UnsupportedImageError) throw err;
    throw new UnsupportedImageError("فایل ارسالی یک تصویر معتبر نیست یا خراب است");
  }
}