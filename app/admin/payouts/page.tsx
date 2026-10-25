import { listSettlementPeriods, getUnsettledMicro } from "@/app/admin/actions/settlement-periods";
import { listPayoutLog } from "@/app/admin/actions/settlement";
import { SettlementPeriodsManager } from "@/components/admin/settlement-periods-manager";
import { PayoutLogTable } from "@/components/admin/payout-log-table";
import { microToUsdt } from "@/lib/units";

export default async function AdminPayoutsPage() {
  const [periods, unsettledMicro, legacyLog] = await Promise.all([
    listSettlementPeriods(),
    getUnsettledMicro(),
    listPayoutLog(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-text-main">تسویه‌حساب دوره‌ای</h1>
        <p className="mt-1 text-sm leading-7 text-text-muted">
          سهم هر ناشر و همکار از تخصیص‌های ثبت‌شده در لحظه‌ی فروش محاسبه می‌شود؛ تغییر قیمت سکه یا درصد قرارداد روی فروش‌های گذشته اثری ندارد. بعد از قفل دوره، ردیف‌ها را تأیید کنید، پرداخت واقعی را با مرجع تراکنش ثبت کنید و دریافت‌کننده تأیید یا مغایرت را از پنل خودش ثبت می‌کند.
        </p>
      </div>

      <SettlementPeriodsManager initialPeriods={periods} unsettledUsdt={microToUsdt(unsettledMicro)} />

      <div>
        <h2 className="mb-3 text-lg font-medium text-text-main">تاریخچه‌ی قدیمی پرداخت‌ها</h2>
        <PayoutLogTable rows={legacyLog} />
      </div>
    </div>
  );
}