"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setPublisherStatus } from "@/app/admin/actions/access";
import { useSystemMessage } from "@/components/ui/system-message";

export function PublisherStatusPanel({ publisherId, initialStatus }: { publisherId: string; initialStatus: "ACTIVE" | "SUSPENDED" }) {
  const router = useRouter();
  const msg = useSystemMessage();
  const [status, setStatus] = useState(initialStatus);
  const [pending, setPending] = useState(false);
  const suspended = status === "SUSPENDED";

  async function handleToggle() {
    let reason: string | null = "";
    if (!suspended) {
      reason = await msg.prompt({
        title: "تعلیق ناشر",
        message: "ناشر و اعضای تیم او دسترسی به پنل را از دست می‌دهند. آثار، نسخه‌ها، خریدها و درآمدها کاملاً حفظ می‌شوند.",
        label: "دلیل تعلیق",
        multiline: true,
        minLength: 3,
        maxLength: 300,
        confirmLabel: "تعلیق ناشر",
      });
      if (reason === null) return;
    } else {
      const ok = await msg.confirm({ title: "رفع تعلیق", message: "دسترسی ناشر و تیم او به حالت قبل برمی‌گردد.", confirmLabel: "رفع تعلیق" });
      if (!ok) return;
    }

    setPending(true);
    try {
      const result = await setPublisherStatus(publisherId, suspended ? "ACTIVE" : "SUSPENDED", reason);
      if (result.success) {
        setStatus(suspended ? "ACTIVE" : "SUSPENDED");
        msg.success(suspended ? "تعلیق برداشته شد" : "ناشر تعلیق شد");
        router.refresh();
      } else {
        msg.error(result.error ?? "عملیات ناموفق بود");
      }
    } catch {
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      className={`rounded-full px-3 py-1 text-xs disabled:opacity-50 ${
        suspended ? "bg-red-500/10 text-red-400" : "border border-border text-text-muted"
      }`}
    >
      {suspended ? "معلق — رفع تعلیق" : "تعلیق ناشر"}
    </button>
  );
}