"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { purgeTrashItem, restoreTrashItem, type TrashItem, type TrashType } from "@/app/admin/actions/trash";
import { useSystemMessage } from "@/components/ui/system-message";
import { formatDateTime } from "@/lib/format";

const TYPE_LABELS: Record<TrashType, string> = { COMIC: "عنوان", EDITION: "نسخه", CHAPTER: "چپتر" };

const FILTERS: { value: TrashType | ""; label: string }[] = [
  { value: "", label: "همه" },
  { value: "COMIC", label: "عناوین" },
  { value: "EDITION", label: "نسخه‌ها" },
  { value: "CHAPTER", label: "چپترها" },
];

export function TrashManager({ initialItems }: { initialItems: TrashItem[] }) {
  const router = useRouter();
  const msg = useSystemMessage();
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<TrashType | "">("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const visible = filter ? items.filter((item) => item.type === filter) : items;

  async function run(item: TrashItem, task: () => Promise<{ success: boolean; error?: string }>, successMessage: string) {
    const key = `${item.type}:${item.id}`;
    setBusyKey(key);
    try {
      const result = await task();
      if (result.success) {
        msg.success(successMessage);
        setItems((prev) => prev.filter((entry) => !(entry.type === item.type && entry.id === item.id)));
        router.refresh();
      } else {
        msg.error(result.error ?? "عملیات ناموفق بود");
      }
    } catch {
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
    setBusyKey(null);
  }

  async function handleRestore(item: TrashItem) {
    const ok = await msg.confirm({
      title: "بازگردانی",
      message: `«${item.title}» با همان وضعیت قبل از حذف بازگردانده می‌شود.`,
      confirmLabel: "بازگردانی",
    });
    if (ok) await run(item, () => restoreTrashItem(item.type, item.id), "بازگردانی انجام شد");
  }

  async function handlePurge(item: TrashItem) {
    const ok = await msg.confirm({
      title: "حذف نهایی",
      message: `«${item.title}» و فایل‌های آن برای همیشه پاک می‌شود و قابل بازگشت نیست.`,
      confirmLabel: "حذف نهایی",
      danger: true,
    });
    if (ok) await run(item, () => purgeTrashItem(item.type, item.id), "حذف نهایی انجام شد");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={`min-h-10 rounded-full border px-4 text-xs ${
              filter === item.value ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="divide-y divide-border rounded-md border border-border">
        {visible.map((item) => {
          const busy = busyKey === `${item.type}:${item.id}`;
          return (
            <div key={`${item.type}:${item.id}`} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-text-main">
                    <span className="ml-2 rounded-full bg-background px-2 py-0.5 text-[10px] text-text-muted">{TYPE_LABELS[item.type]}</span>
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {formatDateTime(item.deletedAt)}
                    {item.deletedByName && ` · توسط ${item.deletedByName}`}
                  </p>
                </div>
                {item.hasSales && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">دارای سابقه‌ی فروش</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleRestore(item)}
                  className="min-h-9 rounded-md border border-primary px-3 text-xs text-primary disabled:opacity-50"
                >
                  بازگردانی
                </button>
                {item.type !== "EDITION" && !item.hasSales && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handlePurge(item)}
                    className="min-h-9 rounded-md border border-red-400 px-3 text-xs text-red-400 disabled:opacity-50"
                  >
                    حذف نهایی
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {visible.length === 0 && <p className="px-4 py-6 text-center text-sm text-text-muted">سطل بازیافت خالی است.</p>}
      </div>
    </div>
  );
}