"use client";

import { useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";
import { createGenre } from "@/app/admin/actions/genre-actions";
import { uploadAssetFile } from "@/lib/client/asset-upload";

export function CreateGenreForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    const result = await uploadAssetFile("genre-image", draftId, file);
    setUploading(false);
    if (result.success && result.url) setImageUrl(result.url);
    else setError(result.error ?? "خطا در آپلود تصویر");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving || uploading) return;

    setSaving(true);
    setError(null);
    const result = await createGenre({ id: draftId, name, imageUrl: imageUrl || undefined });
    setSaving(false);

    if (result.success) {
      setName("");
      setImageUrl("");
      setDraftId(crypto.randomUUID());
      router.refresh();
    } else {
      setError(result.error ?? "خطایی رخ داد");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-center gap-2">
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
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label="انتخاب تصویر ژانر"
          className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface text-text-muted disabled:opacity-50"
        >
          {imageUrl ? <Image src={imageUrl} alt="" fill sizes="44px" unoptimized className="object-cover" /> : <ImagePlus size={18} />}
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="نام ژانر جدید"
          maxLength={60}
          className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-text-main outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={saving || uploading || !name.trim()}
          className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "…" : "افزودن"}
        </button>
      </div>
      {uploading && <p className="text-xs text-text-muted">در حال آپلود تصویر…</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}