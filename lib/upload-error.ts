import "server-only";
import { PublicStorageMisconfiguredError, StorageNotConfiguredError } from "./s3";

export function describeUploadError(err: unknown): string {
  console.error("[upload-error]", err);
  if (err instanceof StorageNotConfiguredError || err instanceof PublicStorageMisconfiguredError) {
    return err.message;
  }
  return "خطا در آپلود فایل — لطفاً دوباره تلاش کنید.";
}