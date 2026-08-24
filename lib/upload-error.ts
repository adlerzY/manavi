import "server-only";

export function describeUploadError(err: unknown): string {
  console.error("[upload-error]", err);
  return "خطا در آپلود فایل — لطفاً دوباره تلاش کنید.";
}
