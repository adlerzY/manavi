import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getWallet, WALLET_PAGE_SIZE } from "@/lib/wallet";
import { BackButton } from "@/components/navigation/back-button";

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

function formatCoins(value: number): string {
  return Math.abs(value).toLocaleString("fa-IR", { maximumFractionDigits: 2 });
}

export default async function WalletPage({ searchParams }: PageProps) {
  const { page: pageParam } = await searchParams;
  const user = await getSessionUser();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <p className="text-sm text-text-muted">برای مشاهده کیف پول، این صفحه را از داخل تلگرام باز کنید.</p>
      </main>
    );
  }

  const page = Math.max(1, Number(pageParam) || 1);
  const wallet = await getWallet(user.id, page);
  const totalPages = Math.max(1, Math.ceil(wallet.total / WALLET_PAGE_SIZE));

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <BackButton fallbackHref="/app/profile" variant="plain" />
          <h1 className="text-lg font-semibold text-text-main">کیف پول</h1>
        </div>

        <div className="space-y-4 rounded-md border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-text-muted">موجودی فعلی</p>
              <p className="mt-1 text-2xl font-semibold text-primary">🪙 {user.coinsBalance.toLocaleString("fa-IR")}</p>
            </div>
            <Link
              href="/app/shop"
              className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
            >
              شارژ سکه
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-background p-3 text-center">
              <p className="text-sm font-medium text-primary">{formatCoins(wallet.earned)}</p>
              <p className="mt-1 text-xs text-text-muted">مجموع دریافتی</p>
            </div>
            <div className="rounded-md bg-background p-3 text-center">
              <p className="text-sm font-medium text-text-main">{formatCoins(wallet.spent)}</p>
              <p className="mt-1 text-xs text-text-muted">مجموع خرج‌شده</p>
            </div>
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text-main">تاریخچه تراکنش‌ها</h2>
          <div className="divide-y divide-border rounded-md border border-border">
            {wallet.entries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-text-main">{entry.title}</p>
                  {entry.detail && <p className="mt-0.5 truncate text-xs text-text-muted">{entry.detail}</p>}
                  <p className="mt-0.5 text-xs text-text-muted">{new Date(entry.createdAt).toLocaleString("fa-IR")}</p>
                </div>
                <p
                  dir="ltr"
                  className={`flex-shrink-0 text-sm font-medium ${entry.coins > 0 ? "text-primary" : "text-text-main"}`}
                >
                  {entry.coins > 0 ? "+" : "−"}
                  {formatCoins(entry.coins)}
                </p>
              </div>
            ))}
            {wallet.entries.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-text-muted">هنوز تراکنشی ثبت نشده است.</p>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-text-muted">
              <Link
                href={`/app/wallet${page - 1 > 1 ? `?page=${page - 1}` : ""}`}
                className={`rounded-md border border-border px-3 py-2 ${
                  page <= 1 ? "pointer-events-none opacity-30" : "hover:border-primary"
                }`}
              >
                قبلی
              </Link>
              <span>
                صفحه {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}
              </span>
              <Link
                href={`/app/wallet?page=${page + 1}`}
                className={`rounded-md border border-border px-3 py-2 ${
                  page >= totalPages ? "pointer-events-none opacity-30" : "hover:border-primary"
                }`}
              >
                بعدی
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}