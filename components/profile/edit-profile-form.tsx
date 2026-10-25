"use client";

import { useState, type FormEvent } from "react";
import { updateProfileDetails } from "@/app/actions/profile";
import { uploadOwnAvatarAction } from "@/app/actions/avatar";
import { AvatarUploadCropper } from "@/components/profile/avatar-upload-cropper";
import type { ProfileLink } from "@/lib/profile-links";

interface EditProfileFormProps {
  canUploadAvatar: boolean;
  initialBio: string | null;
  initialAvatarUrl: string | null;
  initialDonationLink: string | null;
  initialCryptoWalletLabel: string | null;
  initialCryptoWalletAddress: string | null;
  initialCustomLinks: ProfileLink[];
  onSaved?: () => void;
}

export function EditProfileForm({
  canUploadAvatar,
  initialBio,
  initialAvatarUrl,
  initialDonationLink,
  initialCryptoWalletLabel,
  initialCryptoWalletAddress,
  initialCustomLinks,
  onSaved,
}: EditProfileFormProps) {
  const [bio, setBio] = useState(initialBio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? "");
  const [donationLink, setDonationLink] = useState(initialDonationLink ?? "");
  const [cryptoWalletLabel, setCryptoWalletLabel] = useState(initialCryptoWalletLabel ?? "");
  const [cryptoWalletAddress, setCryptoWalletAddress] = useState(initialCryptoWalletAddress ?? "");
  const [customLinks, setCustomLinks] = useState<ProfileLink[]>(initialCustomLinks);
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  function updateLink(index: number, field: keyof ProfileLink, value: string) {
    setCustomLinks((prev) => prev.map((link, i) => (i === index ? { ...link, [field]: value } : link)));
  }
  function addLink() {
    if (customLinks.length >= 5) return;
    setCustomLinks((prev) => [...prev, { label: "", url: "" }]);
  }
  function removeLink(index: number) {
    setCustomLinks((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);

    const result = await updateProfileDetails({
      bio,
      avatarUrl,
      donationLink,
      cryptoWalletLabel,
      cryptoWalletAddress,
      customLinks: customLinks.filter((l) => l.label.trim() && l.url.trim()),
    });

    if (result.success) {
      setStatus("done");
      setTimeout(() => onSaved?.(), 800);
    } else {
      setStatus("error");
      setError(result.error ?? "خطا در ذخیره‌سازی");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-border bg-surface p-4">
      <div className="space-y-1">
        <span className="text-sm text-text-muted">عکس پروفایل</span>
        {canUploadAvatar ? (
          <>
            <p className="text-xs text-text-muted">
              پیش‌فرض از عکس پروفایل تلگرام شما گرفته می‌شود. برای تنظیم دستی، یک تصویر آپلود کنید.
            </p>
            <AvatarUploadCropper uploadAction={uploadOwnAvatarAction} onUploaded={setAvatarUrl} />
          </>
        ) : (
          <p className="text-xs leading-6 text-text-muted">
            عکس پروفایل شما از تلگرام گرفته می‌شود. آپلود عکس اختصاصی فقط برای ناشرها، اعضای تیم و مدیران فعال است.
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm text-text-muted" htmlFor="profile-bio">بیوگرافی</label>
        <textarea id="profile-bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={500} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary" />
      </div>

      <div className="space-y-1">
        <label className="text-sm text-text-muted" htmlFor="profile-donation">لینک دونیت خارجی (اختیاری)</label>
        <input id="profile-donation" value={donationLink} onChange={(e) => setDonationLink(e.target.value)} placeholder="https://..." className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary" />
      </div>

      <div className="space-y-2 rounded-md border border-border bg-background p-3">
        <p className="text-sm text-text-muted">کیف پول ارزی (برای دونیت شفاف — اختیاری)</p>
        <div className="grid grid-cols-2 gap-2">
          <input value={cryptoWalletLabel} onChange={(e) => setCryptoWalletLabel(e.target.value)} placeholder="عنوان (مثلاً USDT - TRC20)" className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-main outline-none focus:border-primary" />
          <input value={cryptoWalletAddress} onChange={(e) => setCryptoWalletAddress(e.target.value)} placeholder="آدرس کیف پول" className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-main outline-none focus:border-primary" />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-muted">لینک‌های دلخواه (تا ۵ مورد)</p>
          {customLinks.length < 5 && (
            <button type="button" onClick={addLink} className="text-xs text-primary">+ افزودن لینک</button>
          )}
        </div>
        {customLinks.map((link, index) => (
          <div key={index} className="flex gap-2">
            <input value={link.label} onChange={(e) => updateLink(index, "label", e.target.value)} placeholder="عنوان" className="w-1/3 rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary" />
            <input value={link.url} onChange={(e) => updateLink(index, "url", e.target.value)} placeholder="https://..." className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary" />
            <button type="button" onClick={() => removeLink(index)} className="rounded-md border border-red-400 px-2 text-xs text-red-400">حذف</button>
          </div>
        ))}
      </div>

      {status === "error" && <p className="text-sm text-red-400">{error}</p>}
      {status === "done" && <p className="text-sm text-primary">پروفایل ذخیره شد.</p>}

      <button type="submit" disabled={status === "saving"} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {status === "saving" ? "در حال ذخیره…" : "ذخیره تغییرات"}
      </button>
    </form>
  );
}