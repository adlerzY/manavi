"use client";

import { useState, useTransition } from "react";
import { setActiveTitle } from "@/app/actions/achievements";
import { METRIC_LABELS, titleLabel, type AchievementMetric, type AchievementProgress } from "@/lib/achievements";

function fa(value: number): string {
  return value.toLocaleString("fa-IR");
}

export function AchievementGrid({
  items,
  initialActiveTitle,
}: {
  items: AchievementProgress[];
  initialActiveTitle: string | null;
}) {
  const [active, setActive] = useState(initialActiveTitle);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleEquip(key: string | null) {
    const previous = active;
    setError(null);
    setActive(key);
    startTransition(async () => {
      const result = await setActiveTitle(key);
      if (!result.success) {
        setActive(previous);
        setError(result.error ?? "خطا در ثبت تگ");
      }
    });
  }

  const metrics = Object.keys(METRIC_LABELS) as AchievementMetric[];
  const activeLabel = titleLabel(active);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface p-4">
        <div>
          <p className="text-xs text-text-muted">تگ فعال شما</p>
          <p className="mt-1 text-sm text-text-main">{activeLabel ?? "بدون تگ"}</p>
        </div>
        {active && (
          <button
            type="button"
            onClick={() => handleEquip(null)}
            disabled={isPending}
            className="min-h-10 rounded-md border border-border px-3 text-xs text-text-muted disabled:opacity-50"
          >
            برداشتن تگ
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {metrics.map((metric) => (
        <section key={metric} className="space-y-2">
          <h2 className="text-sm font-medium text-text-main">{METRIC_LABELS[metric]}</h2>
          <div className="space-y-2">
            {items
              .filter((item) => item.metric === metric)
              .map((item) => {
                const percent = Math.min(100, Math.round((item.current / item.threshold) * 100));
                const equipped = active === item.key;
                return (
                  <div
                    key={item.key}
                    className={`space-y-2 rounded-md border p-3 ${item.earned ? "border-primary/40 bg-primary/5" : "border-border bg-surface"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm ${item.earned ? "text-text-main" : "text-text-muted"}`}>
                        {item.emoji} {item.label}
                      </p>
                      {item.earned ? (
                        equipped ? (
                          <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs text-accent">تگ فعال</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleEquip(item.key)}
                            disabled={isPending}
                            className="min-h-9 rounded-md border border-primary px-3 text-xs text-primary disabled:opacity-50"
                          >
                            انتخاب به‌عنوان تگ
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-text-muted">
                          {fa(Math.min(item.current, item.threshold))} / {fa(item.threshold)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs leading-6 text-text-muted">{item.description}</p>
                    {!item.earned && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-border">
                        <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}