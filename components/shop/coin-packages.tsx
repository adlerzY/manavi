"use client";

import { useRouter } from "next/navigation";
import { TonConnectButton, useTonAddress } from "@tonconnect/ui-react";
import { TonPayButton } from "@/components/payments/ton-pay-button";
import { createTonCoinPayment } from "@/app/actions/ton-payments";
import type { CoinPackageView } from "@/lib/coin-packages";

interface CoinPackagesProps {
  packages: CoinPackageView[];
  authenticated: boolean;
  tonConfigured: boolean;
  redirectTo?: string;
  coinCost: number;
  tomanPerUsdt: number;
}

function rate(pack: CoinPackageView): number {
  return pack.priceUsdt / pack.totalCoins;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function CoinPackages({ packages, authenticated, tonConfigured, redirectTo, coinCost, tomanPerUsdt }: CoinPackagesProps) {
  const router = useRouter();
  const walletAddress = useTonAddress();
  const bestValueId = packages.length > 0 ? [...packages].sort((a, b) => rate(a) - rate(b))[0].id : null;

  if (packages.length === 0) {
    return <p className="text-sm text-text-muted">در حال حاضر پکیج سکه‌ای برای فروش تعریف نشده است.</p>;
  }
  if (!tonConfigured) {
    return <p className="text-sm text-text-muted">پرداخت موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2">
        <TonConnectButton />
        <p className={`text-xs ${walletAddress ? "text-primary" : "text-text-muted"}`}>
          {walletAddress ? `کیف پول متصل است (${shortAddress(walletAddress)})` : "کیف پول متصل نیست — برای خرید ابتدا آن را وصل کنید."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {packages.map((pack) => {
          const equivalentChapters = coinCost > 0 ? Math.floor(pack.totalCoins / coinCost) : 0;
          const tomanEquivalent = tomanPerUsdt > 0 ? Math.round(pack.priceUsdt * tomanPerUsdt) : null;
          const bonusPercent = pack.coins > 0 && pack.bonusCoins > 0 ? Math.round((pack.bonusCoins / pack.coins) * 100) : 0;
          const unitPrice = pack.totalCoins > 0 ? pack.priceUsdt / pack.totalCoins : 0;
          return (
            <div
              key={pack.id}
              className={`relative flex flex-col rounded-md border p-4 text-center ${
                pack.id === bestValueId ? "border-accent bg-accent/5" : "border-border bg-surface"
              }`}
            >
              {(pack.badge || pack.id === bestValueId) && (
                <span className="absolute -top-3 right-1/2 translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
                  {pack.badge || "به‌صرفه‌ترین"}
                </span>
              )}

              <p className="mt-1 text-base font-semibold text-text-main">🪙 {pack.coins.toLocaleString("fa-IR")}</p>

              {pack.bonusCoins > 0 && (
                <p className="mt-1 text-xs text-primary">
                  +{pack.bonusCoins.toLocaleString("fa-IR")} سکه هدیه ({bonusPercent.toLocaleString("fa-IR")}٪ بیشتر)
                </p>
              )}

              <div className="mt-2 space-y-0.5 text-xs text-text-muted">
                {pack.bonusCoins > 0 && <p>مجموع {pack.totalCoins.toLocaleString("fa-IR")} سکه</p>}
                {equivalentChapters > 0 && <p>≈ {equivalentChapters.toLocaleString("fa-IR")} چپتر</p>}
                <p>هر سکه ≈ {unitPrice.toLocaleString("fa-IR", { maximumFractionDigits: 5 })} USDT</p>
              </div>

              <div className="mt-auto pt-3">
                <TonPayButton
                  label={`${pack.priceUsdt.toLocaleString("fa-IR", { maximumFractionDigits: 6 })} USDT`}
                  disabled={!authenticated}
                  className="min-h-11 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  successMessage="پرداخت تایید شد — سکه به حساب شما اضافه شد"
                  createPayment={(address) => createTonCoinPayment(pack.id, address)}
                  onPaid={() => (redirectTo ? router.push(redirectTo) : router.refresh())}
                />
                {tomanEquivalent !== null && (
                  <p className="mt-1.5 text-xs text-text-muted">≈ {tomanEquivalent.toLocaleString("fa-IR")} تومان</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!authenticated && <p className="text-xs text-text-muted">برای خرید سکه باید از داخل تلگرام وارد شوید.</p>}
    </div>
  );
}