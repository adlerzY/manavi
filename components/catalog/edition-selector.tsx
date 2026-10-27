import Link from "next/link";
import { languageLabel } from "@/lib/languages";
import { adjustedScore, averageScore } from "@/lib/rating";
import type { EditionSummary } from "@/lib/editions";

export interface EditionOption extends EditionSummary {
  price: number;
}

interface EditionSelectorProps {
  slug: string;
  editions: EditionOption[];
  selectedId: string;
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-text-main">{value}</dd>
    </div>
  );
}

export function EditionSelector({ slug, editions, selectedId }: EditionSelectorProps) {
  const selected = editions.find((edition) => edition.id === selectedId) ?? editions[0];
  if (!selected) return null;

  const languages = [...new Set(editions.map((edition) => edition.language))];
  const inLanguage = editions
    .filter((edition) => edition.language === selected.language)
    .sort((a, b) => adjustedScore(b.ratingTotal, b.ratingCount) - adjustedScore(a.ratingTotal, a.ratingCount));

  return (
    <section className="space-y-3 rounded-md border border-border bg-surface p-3">
      <h2 className="text-sm font-medium text-text-main">انتخاب نسخه و مترجم</h2>

      {languages.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {languages.map((language) => (
            <Link
              key={language}
              href={`/app/comic/${slug}?lang=${language}`}
              className={`rounded-full px-4 py-2 text-xs ${
                language === selected.language ? "bg-primary text-primary-foreground" : "bg-background text-text-muted"
              }`}
            >
              {languageLabel(language)}
            </Link>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {inLanguage.map((edition) => {
          const active = edition.id === selected.id;
          return (
            <Link
              key={edition.id}
              href={`/app/comic/${slug}?edition=${edition.id}`}
              aria-current={active ? "true" : undefined}
              className={`block space-y-3 rounded-md border p-3 ${
                active ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-text-main">
                  {edition.title ?? edition.publisherName}
                  {edition.title && <span className="mr-1 text-xs text-text-muted">— {edition.publisherName}</span>}
                </p>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  {active && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">انتخاب‌شده</span>}
                  {edition.status === "ARCHIVED" && (
                    <span className="rounded-full bg-border px-2.5 py-1 text-xs text-text-muted">آرشیو</span>
                  )}
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Meta label="زبان ترجمه" value={languageLabel(edition.language)} />
                <Meta
                  label="کیفیت ترجمه"
                  value={
                    edition.ratingCount > 0
                      ? `★ ${averageScore(edition.ratingTotal, edition.ratingCount).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} (${edition.ratingCount.toLocaleString("fa-IR")} رأی)`
                      : "بدون امتیاز"
                  }
                />
                <Meta label="چپتر منتشرشده" value={edition.chapterCount.toLocaleString("fa-IR")} />
                <Meta
                  label="آخرین به‌روزرسانی"
                  value={edition.latestPublishedAt ? edition.latestPublishedAt.toLocaleDateString("fa-IR") : "—"}
                />
              </dl>

              <p className="text-xs text-text-muted">
                هزینه باز کردن هر چپتر سکه‌ای: <span className="text-accent">{edition.price.toLocaleString("fa-IR")} سکه</span>
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}