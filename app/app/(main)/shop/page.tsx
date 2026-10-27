import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getActiveCoinPackages } from "@/lib/coin-packages";
import { isTonConfigured } from "@/lib/ton";
import { getChapterUnlockCoinCost, getCoinPriceUsdt, getTomanPerUsdt } from "@/lib/platform-settings";
import { CoinPackages } from "@/components/shop/coin-packages";
import { CustomCoinPurchase } from "@/components/shop/custom-coin-purchase";
import { TonConnectProvider } from "@/components/providers/ton-connect-provider";

interface PageProps {
  searchParams: Promise<{ redirect?: string }>;
}

export default async function ShopPage({ searchParams }: PageProps) {
  const { redirect } = await searchParams;
  const safeRedirect = redirect && redirect.startsWith("/app/") ? redirect : undefined;

  const [user, coinPackages, coinCost, coinPriceUsdt, tomanPerUsdt] = await Promise.all([
    getSessionUser(),
    getActiveCoinPackages(),
    getChapterUnlockCoinCost(),
    getCoinPriceUsdt(),
    getTomanPerUsdt(),
  ]);
  const tonConfigured = isTonConfigured();

  return (
    <TonConnectProvider>
      <main className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-8">
          <div>
            <h1 className="text-lg font-medium text-text-main">فروشگاه سکه</h1>
            <p className="mt-1 text-sm text-text-muted">
              موجودی سکه شما: {(user?.coinsBalance ?? 0).toLocaleString("fa-IR")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <Link href="/app/wallet" className="text-sm text-primary underline">
                تاریخچه تراکنش‌ها
              </Link>
              <Link href="/buy-with-ton" className="text-sm text-primary underline">
                آموزش خرید
              </Link>
            </div>
          </div>

          <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm leading-7 text-text-muted">
            سکه تنها ارز داخل ماناویه؛ باهاش می‌تونی <span className="text-text-main">چپترهای سکه‌ای رو باز کنی</span> و{" "}
            <span className="text-text-main">مستقیم از مترجم‌ها و طراح‌ها حمایت مالی (دونیت) کنی</span>. هر چپتر سکه‌ای دقیقاً{" "}
            <span className="font-medium text-primary">{coinCost.toLocaleString("fa-IR")} سکه</span> هزینه داره — این قیمت روی همه‌ی چپترهای پولی ماناوی یکسانه.
          </div>

          {!tonConfigured && (
            <div className="rounded-md border border-accent/40 bg-accent/5 px-4 py-3 text-sm text-accent">
              پرداخت موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.
            </div>
          )}

          <section>
            <h2 className="mb-3 text-sm font-medium text-text-main">پکیج‌های سکه</h2>
            <CoinPackages
              packages={coinPackages}
              authenticated={Boolean(user)}
              tonConfigured={tonConfigured}
              redirectTo={safeRedirect}
              coinCost={coinCost}
              tomanPerUsdt={tomanPerUsdt}
            />
          </section>

          {tonConfigured && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-text-main">خرید سکه به مقدار دلخواه</h2>
              <CustomCoinPurchase
                authenticated={Boolean(user)}
                coinCost={coinCost}
                coinPriceUsdt={coinPriceUsdt}
                tomanPerUsdt={tomanPerUsdt}
                redirectTo={safeRedirect}
              />
            </section>
          )}
        </div>
      </main>
    </TonConnectProvider>
  );
}