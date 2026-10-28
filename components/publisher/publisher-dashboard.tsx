import Link from "next/link";
import { getPublisherDashboard } from "@/lib/publisher-dashboard";
import { getRoyaltyDashboard } from "@/app/publisher/actions/royalty";
import { CHAPTER_STATUS_LABELS } from "@/lib/labels";
import { languageLabel } from "@/lib/languages";
import { formatUsdt } from "@/lib/settlement-labels";
import type { ChapterStatus } from "@prisma/client";

interface ActionItem {
  key: string;
  label: string;
  href: string;
  tone: "danger" | "warning" | "info";
}

const TONE_CLASSES: Record<ActionItem["tone"], string> = {
  danger: "border-red-400/40 bg-red-500/5 text-red-400",
  warning: "border-accent/40 bg-accent/5 text-accent",
  info: "border-primary/40 bg-primary/5 text-primary",
};

const CHAPTER_BADGE_CLASSES: Record<ChapterStatus, string> = {
  PUBLISHED: "bg-primary/10 text-primary",
  PENDING_APPROVAL: "bg-accent/10 text-accent",
  SCHEDULED: "bg-border text-text-muted",
  DRAFT: "bg-border text-text-muted",
};

function StatCard({ label, value, tone = "primary" }: { label: string; value: string; tone?: "primary" | "accent" }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4 text-center">
      <p className={`text-xl font-semibold ${tone === "accent" ? "text-accent" : "text-primary"}`}>{value}</p>
      <p className="mt-1 text-xs text-text-muted">{label}</p>
    </div>
  );
}

function formatCoins(value: number): string {
  return value.toLocaleString("fa-IR", { maximumFractionDigits: 2 });
}

export async function PublisherDashboard({ publisherId }: { publisherId: string }) {
  const [data, royalty] = await Promise.all([getPublisherDashboard(publisherId), getRoyaltyDashboard()]);

  const actions: ActionItem[] = [];
  if (data.needsChangesComics > 0) {
    actions.push({
      key: "needs-changes",
      label: `${data.needsChangesComics.toLocaleString("fa-IR")} عنوان نیاز به اصلاح دارد`,
      href: "/publisher/comics?approval=NEEDS_CHANGES",
      tone: "danger",
    });
  }
  if (data.pendingComics > 0) {
    actions.push({
      key: "pending-comics",
      label: `${data.pendingComics.toLocaleString("fa-IR")} عنوان در انتظار تایید ادمین است`,
      href: "/publisher/comics?approval=PENDING_APPROVAL",
      tone: "warning",
    });
  }
  if (data.pendingChapters > 0) {
    actions.push({
      key: "pending-chapters",
      label: `${data.pendingChapters.toLocaleString("fa-IR")} چپتر در انتظار تایید ادمین است`,
      href: "/publisher/comics",
      tone: "warning",
    });
  }
  if (data.awaitingConfirmation > 0) {
    actions.push({
      key: "awaiting-confirmation",
      label: `${data.awaitingConfirmation.toLocaleString("fa-IR")} پرداخت منتظر تأیید دریافت شماست`,
      href: "/publisher/earnings",
      tone: "info",
    });
  }

  const latest = data.recentChapters[0];
  const uploadHref = latest ? `/publisher/comics/${latest.comic.id}?tab=chapters&upload=1` : "/publisher/comics";

  return (
    <div className="space-y-6">
      <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-4">
        <Link
          href={uploadHref}
          className="flex min-h-12 items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
        >
          آپلود چپتر جدید
        </Link>
        <p className="text-center text-xs text-text-muted">
          {latest ? `برای «${latest.comic.title}» — برای اثر دیگر، از ` : "ابتدا از "}
          <Link href="/publisher/comics" className="text-primary underline">
            فهرست آثار
          </Link>{" "}
          اثر را انتخاب کنید.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-text-main">نیاز به اقدام</h2>
        {actions.length > 0 ? (
          <div className="space-y-2">
            {actions.map((action) => (
              <Link
                key={action.key}
                href={action.href}
                className={`flex min-h-12 items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm ${TONE_CLASSES[action.tone]}`}
              >
                <span>{action.label}</span>
                <span className="flex-shrink-0 text-xs">مشاهده</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-text-muted">فعلاً کار معوقی ندارید.</p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="چپتر منتشرشده" value={data.publishedChapters.toLocaleString("fa-IR")} />
        <StatCard label="چپتر در انتظار تایید" value={data.pendingChapters.toLocaleString("fa-IR")} tone="accent" />
        <StatCard label="سهم ناشر در این ماه" value={formatUsdt(data.monthRevenueUsdt)} />
        <StatCard label="طلب تسویه‌نشده" value={formatUsdt(data.outstandingUsdt)} tone="accent" />
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-main">سهم این ماه به تفکیک نسخه</h2>
          <Link href="/publisher/earnings" className="text-xs text-primary">
            درآمد و تسویه
          </Link>
        </div>
        <div className="divide-y divide-border rounded-md border border-border">
          {royalty.summaries.map((summary) => (
            <div key={summary.editionId} className="px-4 py-3">
              <p className="text-sm text-text-main">
                {summary.workTitle} — {languageLabel(summary.language)}
              </p>
              <p className="mt-1 text-xs leading-6 text-text-muted">
                سکه خرج‌شده: {formatCoins(summary.grossCoins)} · سهم ناشر و اعضا: {formatCoins(summary.publisherShareCoins)} · باقی‌مانده نزد ناشر:{" "}
                {formatCoins(summary.retainedCoins)}
              </p>
            </div>
          ))}
          {royalty.summaries.length === 0 && (
            <p className="px-4 py-3 text-sm text-text-muted">در این ماه فروشی ثبت نشده است.</p>
          )}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-text-main">آخرین چپترها</h2>
          <div className="divide-y divide-border rounded-md border border-border">
            {data.recentChapters.map((chapter) => (
              <Link
                key={chapter.id}
                href={`/publisher/comics/${chapter.comic.id}?tab=chapters`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-text-main">{chapter.comic.title}</p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    چپتر {chapter.chapterNumber.toLocaleString("fa-IR")} · {chapter.createdAt.toLocaleDateString("fa-IR")}
                  </p>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs ${CHAPTER_BADGE_CLASSES[chapter.status]}`}>
                  {CHAPTER_STATUS_LABELS[chapter.status]}
                </span>
              </Link>
            ))}
            {data.recentChapters.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">هنوز چپتری آپلود نشده است.</p>}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-main">آخرین نظرات</h2>
            <Link href="/publisher/comments" className="text-xs text-primary">
              همه نظرات
            </Link>
          </div>
          <div className="divide-y divide-border rounded-md border border-border">
            {data.recentComments.map((comment) => (
              <div key={comment.id} className="px-4 py-3">
                <p className="text-xs text-text-muted">
                  {comment.authorName} · {comment.comicTitle} — چپتر {comment.chapterNumber.toLocaleString("fa-IR")}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-text-main">{comment.content}</p>
              </div>
            ))}
            {data.recentComments.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">هنوز نظری ثبت نشده است.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}