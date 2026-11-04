"use client";

import { useRouter } from "next/navigation";
import { trashComic } from "@/app/admin/actions/trash";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";

export function ComicDeleteButton({ comicId, comicTitle }: { comicId: string; comicTitle: string }) {
  const router = useRouter();

  return (
    <DeleteConfirmDialog
      triggerLabel="انتقال به سطل بازیافت"
      confirmTitle={`حذف «${comicTitle}»`}
      confirmDescription="عنوان از دید کاربران پنهان می‌شود اما چپترها، فایل‌ها، نظرات، خریدها و درآمدها حفظ می‌شوند. از بخش «عملیات حساس و بازیابی» می‌توانید آن را بازگردانید."
      confirmValue={comicTitle}
      onConfirm={() => trashComic(comicId)}
      onDeleted={() => router.push("/admin/comics")}
    />
  );
}