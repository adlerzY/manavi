import { getTopComics, getTopChapters, getCoinStats } from "@/app/admin/actions/analytics";

export default async function AdminAnalyticsPage() {
  const [topComics, topChapters, coinStats] = await Promise.all([getTopComics(10), getTopChapters(10), getCoinStats()]);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-md border border-border bg-surface p-4 text-center">
          <p className="text-2xl font-semibold text-primary">{coinStats.totalRevenueUsdt.toLocaleString("fa-IR")} USDT</p>
          <p className="mt-1 text-xs text-text-muted">
            درآمد خرید سکه{coinStats.totalRevenueToman !== null && ` (≈ ${coinStats.totalRevenueToman.toLocaleString("fa-IR")} تومان)`}
          </p>
        </div>
        <div className="rounded-md border border-border bg-surface p-4 text-center">
          <p className="text-2xl font-semibold text-primary">{coinStats.purchaseCount.toLocaleString("fa-IR")}</p>
          <p className="mt-1 text-xs text-text-muted">تعداد خرید سکه</p>
        </div>
        <div className="rounded-md border border-border bg-surface p-4 text-center">
          <p className="text-2xl font-semibold text-primary">{coinStats.totalCoinsSpent.toLocaleString("fa-IR")}</p>
          <p className="mt-1 text-xs text-text-muted">سکه خرج‌شده روی چپترها</p>
        </div>
        <div className="rounded-md border border-border bg-surface p-4 text-center">
          <p className="text-2xl font-semibold text-primary">{coinStats.donationTotalUsdt.toLocaleString("fa-IR")} USDT</p>
          <p className="mt-1 text-xs text-text-muted">
            مجموع دونیت{coinStats.donationTotalToman !== null && ` (≈ ${coinStats.donationTotalToman.toLocaleString("fa-IR")} تومان)`}
          </p>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium text-text-main">پربازدیدترین عناوین</h2>
        <div className="divide-y divide-border rounded-md border border-border">
          {topComics.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3">
              <p className="text-sm text-text-main">{c.title}</p>
              <p className="text-xs text-text-muted">{c.viewCount.toLocaleString("fa-IR")} بازدید · {c.bookmarkCount.toLocaleString("fa-IR")} بوکمارک</p>
            </div>
          ))}
          {topComics.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">آماری موجود نیست.</p>}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium text-text-main">پربازدیدترین چپترها</h2>
        <div className="divide-y divide-border rounded-md border border-border">
          {topChapters.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3">
              <p className="text-sm text-text-main">{c.comicTitle} — چپتر {c.chapterNumber}</p>
              <p className="text-xs text-text-muted">{c.viewCount.toLocaleString("fa-IR")} بازدید</p>
            </div>
          ))}
          {topChapters.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">آماری موجود نیست.</p>}
        </div>
      </div>
    </div>
  );
}