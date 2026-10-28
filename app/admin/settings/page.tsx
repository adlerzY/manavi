import { getPlatformSettings, getTomanPerUsdt, getCoinPriceUsdt } from "@/lib/platform-settings";
import { listCoinPackages } from "@/app/admin/actions/coin-packages";
import { PageTabs } from "@/components/ui/page-tabs";
import { PlatformSettingsForm } from "@/components/admin/platform-settings-form";
import { CoinPackageManager } from "@/components/admin/coin-package-manager";

const TABS = [
  { id: "general", label: "تنظیمات سراسری", href: "/admin/settings" },
  { id: "coins", label: "پکیج‌های سکه", href: "/admin/settings?tab=coins" },
];

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

async function GeneralTab() {
  const settings = await getPlatformSettings();

  return (
    <PlatformSettingsForm
      initialCoinCost={settings.chapterUnlockCoinCost}
      initialThresholdHours={settings.newReleaseThresholdHours}
      initialCoinPriceUsdt={Number(settings.coinPriceUsdt)}
      initialTomanPerUsdt={settings.tomanPerUsdt}
      initialReferralRewardCoins={settings.referralRewardCoins}
    />
  );
}

async function CoinsTab() {
  const [packages, tomanPerUsdt, coinPriceUsdt] = await Promise.all([
    listCoinPackages(),
    getTomanPerUsdt(),
    getCoinPriceUsdt(),
  ]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        قیمت هر پکیج به‌صورت خودکار از «ارزش هر سکه به تتر» در تنظیمات سراسری محاسبه می‌شود — فقط تعداد سکه و سکه هدیه را تعیین کنید.
      </p>
      <CoinPackageManager initialPackages={packages} tomanPerUsdt={tomanPerUsdt} coinPriceUsdt={coinPriceUsdt} />
    </div>
  );
}

export default async function AdminSettingsPage({ searchParams }: PageProps) {
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "coins" ? "coins" : "general";

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text-main">تنظیمات و سکه</h1>
      <PageTabs tabs={TABS} active={tab} />
      {tab === "coins" ? <CoinsTab /> : <GeneralTab />}
    </div>
  );
}