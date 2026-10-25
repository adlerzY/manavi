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

export function EditionSelector({ slug, editions, selectedId }: EditionSelectorProps) {
  const selected = editions.find((edition) => edition.id === selectedId) ?? editions[0];
  if (!selected) return null;

  const languages = [...new Set(editions.map((edition) => edition.language))];
  const inLanguage = editions
    .filter((edition) => edition.language === selected.language)
    .sort((a, b) => adjustedScore(b.ratingTotal, b.ratingCount) - adjustedScore(a.ratingTotal, a.ratingCount));

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-3">
      {languages.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {languages.map((language) => (
            <Link
              key={language}
              href={`/app/comic/${slug}?lang=${language}`}
              className={`rounded-full px-3 py-1 text-xs ${
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
              className={`block rounded-md border p-3 ${
                active ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-text-main">
                  {edition.title ?? edition.publisherName}
                  {edition.title && <span className="mr-1 text-xs text-text-muted">— {edition.publisherName}</span>}
                </p>
                {edition.status === "ARCHIVED" && (
                  <span className="rounded-full bg-border px-2 py-0.5 text-[10px] text-text-muted">آرشیو</span>
                )}
              </div>
              <p className="mt-1 text-xs text-text-muted">
                {edition.ratingCount > 0
                  ? `★ ${averageScore(edition.ratingTotal, edition.ratingCount).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} (${edition.ratingCount.toLocaleString("fa-IR")} رأی)`
                  : "هنوز امتیازی ثبت نشده"}
                {" · "}
                {edition.chapterCount.toLocaleString("fa-IR")} چپتر
                {" · "}
                هر چپتر سکه‌ای {edition.price.toLocaleString("fa-IR")} سکه
                {edition.latestPublishedAt && ` · آخرین انتشار ${edition.latestPublishedAt.toLocaleDateString("fa-IR")}`}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}