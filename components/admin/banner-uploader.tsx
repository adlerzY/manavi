"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { uploadAssetFile } from "@/lib/client/asset-upload";
import type { AssetKind } from "@/lib/asset-kinds";

interface ImageUploaderProps {
  entityId: string | null;
  currentUrl: string;
  onUploaded: (url: string) => void;
  kind: AssetKind;
  label: string;
  aspectClassName?: string;
}

export function ImageUploader({ entityId, currentUrl, onUploaded, kind, label, aspectClassName = "h-32" }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(file: File) {
    setStatus("uploading");
    setProgress(0);
    setError(null);

    const result = await uploadAssetFile(kind, entityId, file, file.type, setProgress);

    if (result.success && result.url) {
      onUploaded(result.url);
      setStatus("idle");
    } else {
      setStatus("error");
      setError(result.error ?? "خطا در آپلود تصویر");
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-3">
      <p className="text-xs text-text-muted">{label}</p>
      {currentUrl && (
        <div className={`relative w-full overflow-hidden rounded-md bg-surface ${aspectClassName}`}>
          <Image src={currentUrl} alt={label} fill sizes="600px" className="object-cover" />
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleSelect(file);
          e.target.value = "";
        }}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={status === "uploading"}
        className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-main disabled:opacity-50"
      >
        {status === "uploading" ? `در حال آپلود… ${progress}%` : currentUrl ? "تغییر تصویر" : "آپلود تصویر"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function BannerUploader({
  entityId,
  currentUrl,
  onUploaded,
}: {
  entityId: string | null;
  currentUrl: string;
  onUploaded: (url: string) => void;
}) {
  return (
    <ImageUploader
      entityId={entityId}
      currentUrl={currentUrl}
      onUploaded={onUploaded}
      kind="comic-banner"
      label="تصویر بنر هیرو (کیفیت بالا، برای نمایش در صفحه اصلی)"
      aspectClassName="h-32"
    />
  );
}

export function CoverUploader({
  entityId,
  currentUrl,
  onUploaded,
}: {
  entityId: string | null;
  currentUrl: string;
  onUploaded: (url: string) => void;
}) {
  return (
    <ImageUploader
      entityId={entityId}
      currentUrl={currentUrl}
      onUploaded={onUploaded}
      kind="comic-cover"
      label="تصویر کاور (نسبت ابعاد ۲:۳ پیشنهاد می‌شود)"
      aspectClassName="aspect-[2/3] h-56"
    />
  );
}

export function CategoryImageUploader({
  entityId,
  currentUrl,
  onUploaded,
}: {
  entityId: string | null;
  currentUrl: string;
  onUploaded: (url: string) => void;
}) {
  return (
    <ImageUploader
      entityId={entityId}
      currentUrl={currentUrl}
      onUploaded={onUploaded}
      kind="category-image"
      label="تصویر کارت دسته‌بندی"
      aspectClassName="h-24"
    />
  );
}