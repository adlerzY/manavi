"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createLicense } from "@/app/admin/actions/catalog-actions";

interface PublisherOption {
  id: string;
  name: string;
}

export function CreateLicenseForm({ publishers, onCreated }: { publishers: PublisherOption[]; onCreated?: () => void }) {
  const router = useRouter();
  const [publisherId, setPublisherId] = useState(publishers[0]?.id ?? "");
  const [territory, setTerritory] = useState("");
  const [royaltyPercentage, setRoyaltyPercentage] = useState("50");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [contractReference, setContractReference] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);

    try {
      const result = await createLicense({
        publisherId,
        territory: territory.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean),
        royaltyPercentage: Number(royaltyPercentage),
        startDate,
        endDate: endDate || undefined,
        contractReference: contractReference || undefined,
      });

      if (result.success) {
        setStatus("done");
        setTerritory("");
        setContractReference("");
        router.refresh();
        setTimeout(() => onCreated?.(), 1000);
      } else {
        setStatus("error");
        setError(result.error ?? "یه مشکلی پیش اومد");
      }
    } catch {
      setStatus("error");
      setError("درخواست ساخت لایسنس در سمت سرور شکست خورد؛ خطای اصلی را در لاگ Vercel بررسی کنید.");
    }
  }

  if (publishers.length === 0) {
    return (
      <div className="rounded-md border border-border bg-surface p-6 text-sm text-text-muted">
        هنوز ناشری ثبت نشده — قبل از ساخت لایسنس، اول یک ناشر اضافه کن.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-border bg-surface p-6">
      <h2 className="text-lg font-medium text-text-main">افزودن لایسنس</h2>

      <div className="space-y-1">
        <label className="text-sm text-text-muted" htmlFor="license-publisher">ناشر</label>
        <select
          id="license-publisher"
          value={publisherId}
          onChange={(e) => setPublisherId(e.target.value)}
          required
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary"
        >
          {publishers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-sm text-text-muted" htmlFor="license-territory">
          قلمرو <span className="text-text-muted">(کدهای ISO با کاما جدا شوند، مثلاً IR, GLOBAL)</span>
        </label>
        <input
          id="license-territory"
          value={territory}
          onChange={(e) => setTerritory(e.target.value)}
          required
          placeholder="IR, GLOBAL"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="license-royalty">درصد رویالتی ناشر</label>
          <input
            id="license-royalty"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={royaltyPercentage}
            onChange={(e) => setRoyaltyPercentage(e.target.value)}
            required
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="license-contract-ref">
            شماره قرارداد <span className="text-text-muted">(اختیاری)</span>
          </label>
          <input
            id="license-contract-ref"
            value={contractReference}
            onChange={(e) => setContractReference(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="license-start">تاریخ شروع</label>
          <input
            id="license-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="license-end">
            تاریخ پایان <span className="text-text-muted">(اختیاری — بدون محدودیت اگر خالی بماند)</span>
          </label>
          <input
            id="license-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary"
          />
        </div>
      </div>

      <p className="text-xs text-text-muted">
        لایسنس‌های جدید با وضعیت «در انتظار» ساخته می‌شوند. بعد از تایید قرارداد امضاشده، از لیست لایسنس‌ها فعالش کن.
      </p>

      {status === "error" && <p className="text-sm text-red-400">{error}</p>}
      {status === "done" && <p className="text-sm text-primary">لایسنس ساخته شد.</p>}

      <button
        type="submit"
        disabled={status === "saving" || !publisherId}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {status === "saving" ? "در حال ذخیره…" : "ساخت لایسنس"}
      </button>
    </form>
  );
}