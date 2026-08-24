import "server-only";
import sharp from "sharp";

export class InvalidImageError extends Error {}

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

export async function assertRealImage(buffer: Buffer): Promise<void> {
  let format: string | undefined;
  try {
    const meta = await sharp(buffer).metadata();
    format = meta.format;
  } catch {
    throw new InvalidImageError("فایل ارسالی یک تصویر معتبر نیست");
  }
  if (!format || !ALLOWED_FORMATS.has(format)) {
    throw new InvalidImageError("فرمت تصویر معتبر نیست");
  }
}
