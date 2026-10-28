import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getAdminNavCounts, getAdminDashboardExtras } from "@/lib/admin-counts";
import { searchAuditLog } from "@/lib/audit-log";
import { auditGroupLabel } from "@/lib/audit-actions";
import { formatUsdt } from "@/lib/settlement-labels";

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

function fa(value: number): string {
  return value.toLocaleString("fa-IR");
}

export default async function AdminDashboard() {
  await requireAdmin();

  const [nav, extras, recent] = await Promise.all([
    getAdminNavCounts(),
    getAdminDashboardExtras(),
    searchAuditLog({ page: 1, pageSize: 6 }),
  ]);

  const actions: ActionItem[] = [];
  if (nav.disputedLines > 0) {
    actions.push({ key: "disputed", label: `${fa(nav.disputedLines)} ردیف تسویه با مغایرت ثبت‌شده`, href: "/admin/payouts", tone: "danger" });
  }
  if (extras.failedTransactions24h > 0) {
    actions.push({ key: "failed-tx", label: `${fa(extras.failedTransactions24h)} تراکنش ناموفق در ۲۴ ساعت اخیر`, href: "/admin/transactions", tone: "danger" });
  }
  if (nav.pendingChapters > 0) {
    actions.push({ key: "chapters", label: `${fa(nav.pendingChapters)} چپتر در انتظار تایید`, href: "/admin/chapter-approvals", tone: "warning" });
  }
  if (nav.pendingComics > 0) {
    actions.push({ key: "comics", label: `${fa(nav.pendingComics)} عنوان در انتظار تایید`, href: "/admin/chapter-approvals", tone: "warning" });
  }
  if (nav.pendingComments > 0) {
    actions.push({ key: "comments", label: `${fa(nav.pendingComments)} نظر در انتظار بررسی`, href: "/admin/comments?status=PENDING", tone: "warning" });
  }
  if (extras.expiringLicenses > 0) {
    actions.push({ key: "expiring", label: `${fa(extras.expiringLicenses)} لایسنس تا ۳۰ روز آینده منقضی می‌شود`, href: "/admin/publishers?tab=licenses", tone: "warning" });
  }
  if (extras.pendingLicenses > 0) {
    actions.push({ key: "licenses", label: `${fa(extras.pendingLicenses)} لایسنس منتظر فعال‌سازی است`, href: "/admin/publishers?tab=licenses", tone: "info" });
  }
  if (nav.readyToPayLines > 0) {
    actions.push({ key: "ready", label: `${fa(nav.readyToPayLines)} ردیف تسویه آماده پرداخت`, href: "/admin/payouts", tone: "info" });
  }
  if (extras.needsChangesComics > 0) {
    actions.push({ key: "needs-changes", label: `${fa(extras.needsChangesComics)} عنوان منتظر اصلاح ناشر است`, href: "/admin/chapter-approvals", tone: "info" });
  }

  const stats = [
    { label: "کاربران", value: fa(extras.userCount), href: "/admin/users" },
    { label: "عناوین", value: fa(extras.comicCount), href: "/admin/comics" },
    { label: "چپتر منتشرشده", value: fa(extras.publishedChapters), href: "/admin/comics" },
    { label: "ناشران", value: fa(extras.publisherCount), href: "/admin/publishers" },
    { label: "لایسنس فعال", value: fa(extras.activeLicenses), href: "/admin/publishers?tab=licenses" },
    { label: "طلب تسویه‌نشده", value: formatUsdt(extras.unsettledUsdt), href: "/admin/payouts" },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-text-main">داشبورد</h1>

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
          <p className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-text-muted">فعلاً کار معوقی وجود ندارد.</p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-md border border-border bg-surface p-4 text-center hover:border-primary"
          >
            <p className="text-xl font-semibold text-primary">{stat.value}</p>
            <p className="mt-1 text-xs text-text-muted">{stat.label}</p>
          </Link>
        ))}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-main">آخرین فعالیت‌ها</h2>
          <Link href="/admin/logs" className="text-xs text-primary">
            همه لاگ‌ها
          </Link>
        </div>
        <div className="divide-y divide-border rounded-md border border-border">
          {recent.logs.map((log) => (
            <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-text-main">
                  {log.actorName ?? "—"}
                  {auditGroupLabel(log.action) && <span className="text-text-muted"> · {auditGroupLabel(log.action)}</span>}
                </p>
                <p dir="ltr" className="mt-0.5 text-start text-xs text-text-muted">{log.action}</p>
              </div>
              <span className="text-xs text-text-muted">{new Date(log.createdAt).toLocaleString("fa-IR")}</span>
            </div>
          ))}
          {recent.logs.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">فعالیتی ثبت نشده است.</p>}
        </div>
      </section>
    </div>
  );
}