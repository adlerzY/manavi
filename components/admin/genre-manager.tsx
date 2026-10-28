"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { updateGenreImage, deleteGenre } from "@/app/admin/actions/genre-actions";
import { uploadAssetFile } from "@/lib/client/asset-upload";

interface GenreRow {
  id: string;
  name: string;
  imageUrl: string | null;
  comicCount: number;
}

export function GenreManager({ genres }: { genres: GenreRow[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const targetIdRef = useRef<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pickImage(genreId: string) {
    targetIdRef.current = genreId;
    inputRef.current?.click();
  }

  async function handleFile(file: File) {
    const genreId = targetIdRef.current;
    if (!genreId) return;

    setError(null);
    setBusyId(genreId);

    const uploaded = await uploadAssetFile("genre-image", genreId, file);
    if (!uploaded.success || !uploaded.url) {
      setError(uploaded.error ?? "خطا در آپلود تصویر");
      setBusyId(null);
      return;
    }

    const result = await updateGenreImage(genreId, uploaded.url);
    setBusyId(null);
    if (result.success) router.refresh();
    else setError(result.error ?? "خطا در ذخیره تصویر");
  }

  async function handleDelete(genre: GenreRow) {
    if (!confirm(`ژانر «${genre.name}» حذف شود؟`)) return;

    setError(null);
    setBusyId(genre.id);
    const result = await deleteGenre(genre.id);
    setBusyId(null);
    if (result.success) router.refresh();
    else setError(result.error ?? "خطا در حذف");
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-400">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      <div className="divide-y divide-border rounded-md border border-border">
        {genres.map((genre) => (
          <div key={genre.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-surface">
              {genre.imageUrl ? (
                <Image src={genre.imageUrl} alt={genre.name} fill sizes="40px" className="object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center text-xs text-text-muted">{genre.name.charAt(0)}</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-text-main">{genre.name}</p>
              <p className="text-xs text-text-muted">{genre.comicCount.toLocaleString("fa-IR")} اثر</p>
            </div>

            <button
              type="button"
              onClick={() => pickImage(genre.id)}
              disabled={busyId === genre.id}
              className="min-h-9 px-2 text-xs text-primary disabled:opacity-50"
            >
              {busyId === genre.id ? "در حال انجام…" : "تغییر تصویر"}
            </button>
            <button
              type="button"
              onClick={() => handleDelete(genre)}
              disabled={busyId === genre.id}
              className="min-h-9 px-2 text-xs text-red-400 disabled:opacity-50"
            >
              حذف
            </button>
          </div>
        ))}
        {genres.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">هنوز ژانری ثبت نشده.</p>}
      </div>
    </div>
  );
}