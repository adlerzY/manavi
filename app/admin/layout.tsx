import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { SidebarNav, type SidebarNavItem } from "@/components/dashboard/sidebar-nav";
import { TelegramWebAppScript } from "@/components/telegram-web-app-script";
import { TelegramPanelViewport } from "@/components/dashboard/telegram-panel-viewport";

const NAV: SidebarNavItem[] = [
  { href: "/admin", label: "داشبورد", icon: "LayoutDashboard" },
  { href: "/admin/comics", label: "عناوین", icon: "BookOpen", group: "محتوا" },
  { href: "/admin/chapter-approvals", label: "تایید محتوا", icon: "CheckCircle2", group: "محتوا" },
  { href: "/admin/categories", label: "دسته‌بندی‌ها", icon: "Layers", group: "محتوا" },
  { href: "/admin/comments", label: "نظرات", icon: "MessageSquare", group: "محتوا" },
  { href: "/admin/publishers", label: "ناشران و لایسنس‌ها", icon: "Building2", group: "کسب‌وکار" },
  { href: "/admin/users", label: "کاربران", icon: "Users", group: "کسب‌وکار" },
  { href: "/admin/transactions", label: "تراکنش‌ها", icon: "Receipt", group: "مالی" },
  { href: "/admin/payouts", label: "تسویه‌حساب ناشران", icon: "Wallet", group: "مالی" },
  { href: "/admin/analytics", label: "آمار", icon: "BarChart3", group: "مالی" },
  { href: "/admin/settings", label: "تنظیمات و سکه", icon: "Settings", group: "سیستم" },
  { href: "/admin/notices", label: "اعلان‌ها", icon: "Megaphone", group: "سیستم" },
  { href: "/admin/logs", label: "لاگ سیستم", icon: "ScrollText", group: "سیستم" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN" || user.isBanned) {
    redirect(user ? "/app/profile" : "/");
  }

  return (
    <div className="min-h-screen bg-background sm:pr-[68px]">
      <TelegramWebAppScript />
      <TelegramPanelViewport />
      <SidebarNav items={NAV} title="پنل مدیریت ماناوی خوش اومدی سلطان" />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}