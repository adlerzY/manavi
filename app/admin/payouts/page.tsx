import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPayoutSettingsView, searchWithdrawals } from "@/lib/withdrawals";
import { PayoutSettingsForm } from "@/components/admin/payout-settings-form";
import { WithdrawalQueue } from "@/components/admin/withdrawal-queue";
import { formatCoins, formatToman } from "@/lib/withdrawal-types";

export default async function AdminPayoutsPage() {
  await requireAdmin();

  const [settings, initial, balance, open, paid] = await Promise.all([
    getPayoutSettingsView(),
    searchWithdrawals({ status: "ACTIVE", page: 1 }),
    prisma.earningsAccount.aggregate({ _sum: { balanceUnits: true } }),
    prisma.withdrawalRequest.aggregate({
      where: { status: { in: ["PENDING", "PROCESSING"] } },
      _sum: { amountUnits: true, amountToman: true },
      _count: { _all: true },
    }),
    prisma.withdrawalRequest.aggregate({ where: { status: "PAID" }, _sum: { amountUnits: true, amountToman: true } }),
  ]);

  const stats = [
    { label: "موجودی قابل تسویه‌ی همکاران", value: `${formatCoins(Number(balance._sum.balanceUnits ?? 0n) / 100)} سکه` },
    { label: "در صف تسویه", value: `${formatCoins(Number(open._sum.amountUnits ?? 0n) / 100)} سکه` },
    { label: "مبلغ در صف (تومان)", value: formatToman(Number(open._sum.amountToman ?? 0n)) },
    { label: "پرداخت‌شده تاکنون", value: formatToman(Number(paid._sum.amountToman ?? 0n)) },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-text-main">تسویه‌حساب ناشران و همکاران</h1>
        <p className="mt-1 text-sm leading-7 text-text-muted">
          درآمد هر فروش و حمایت مالی به‌صورت سکه به حساب ناشر و دست‌اندرکاران واریز می‌شود. درخواست‌ها را بررسی کنید، با کارت پرداخت کنید و رسید را بارگذاری کنید؛ درخواست‌دهنده دریافت را تأیید یا مغایرت ثبت می‌کند.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-md border border-border bg-surface p-4 text-center">
            <p className="text-sm font-semibold text-primary">{stat.value}</p>
            <p className="mt-1 text-xs text-text-muted">{stat.label}</p>
          </div>
        ))}
      </section>

      <PayoutSettingsForm
        initialValueToman={settings.explicitValueToman}
        initialMinCoins={settings.minCoins}
        effectiveValueToman={settings.effectiveValueToman}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-text-main">درخواست‌های تسویه</h2>
        <WithdrawalQueue initialWithdrawals={initial.withdrawals} initialTotal={initial.total} />
      </section>
    </div>
  );
}