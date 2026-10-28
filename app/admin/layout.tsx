import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getAdminNavCounts } from "@/lib/admin-counts";
import { SidebarNav, type SidebarNavItem } from "@/components/dashboard/sidebar-nav";
import { TelegramWebAppScript } from "@/components/telegram-web-app-script";
import { TelegramPanelViewport } from "@/components/dashboard/telegram-panel-viewport";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN" || user.isBanned) {
    redirect(user ? "/app/profile" : "/");
  }

  const counts = await getAdminNavCounts();

  const nav: SidebarNavItem[] = [
    { href: "/admin", label: "داشبورد", icon: "LayoutDashboard" },
    { href: "/admin/comics", label: "عناوین و چپترها", icon: "BookOpen", group: "مدیریت محتوا" },
    { href: "/admin/chapter-approvals", label: "تایید محتوا", icon: "CheckCircle2", group: "مدیریت محتوا", badge: counts.approvals },
    { href: "/admin/categories", label: "دسته‌بندی و ژانر", icon: "Layers", group: "مدیریت محتوا" },
    { href: "/admin/comments", label: "نظرات", icon: "MessageSquare", group: "مدیریت محتوا", badge: counts.pendingComments },
    { href: "/admin/users", label: "کاربران", icon: "Users", group: "کاربران و ناشران" },
    { href: "/admin/publishers", label: "ناشران و لایسنس‌ها", icon: "Building2", group: "کاربران و ناشران" },
    { href: "/admin/transactions", label: "تراکنش‌ها", icon: "Receipt", group: "مالی و گزارش‌ها" },
    { href: "/admin/payouts", label: "تسویه‌حساب ناشران", icon: "Wallet", group: "مالی و گزارش‌ها", badge: counts.payouts },
    { href: "/admin/analytics", label: "آمار و تحلیل", icon: "BarChart3", group: "مالی و گزارش‌ها" },
    { href: "/admin/settings", label: "تنظیمات و سکه", icon: "Settings", group: "سیستم" },
    { href: "/admin/notices", label: "اعلان همگانی", icon: "Megaphone", group: "سیستم" },
    { href: "/admin/logs", label: "لاگ سیستم", icon: "ScrollText", group: "سیستم" },
  ];

  return (
    <div className="min-h-screen bg-background sm:pr-[68px]">
      <TelegramWebAppScript />
      <TelegramPanelViewport />
      <SidebarNav items={nav} title="مدیریت ماناوی" />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}