import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { SidebarNav, type SidebarNavItem } from "@/components/dashboard/sidebar-nav";
import { TelegramWebAppScript } from "@/components/telegram-web-app-script";
import { TelegramPanelViewport } from "@/components/dashboard/telegram-panel-viewport";

const NAV: SidebarNavItem[] = [
  { href: "/admin", label: "داشبورد", icon: "LayoutDashboard" },
  { href: "/admin/publishers", label: "ناشران", icon: "Building2" },
  { href: "/admin/licenses", label: "لایسنس‌ها", icon: "FileSignature" },
  { href: "/admin/comics", label: "عناوین", icon: "BookOpen" },
  { href: "/admin/chapter-approvals", label: "تایید چپترها", icon: "CheckCircle2" },
  { href: "/admin/categories", label: "دسته‌بندی‌های اصلی", icon: "Layers" },
  { href: "/admin/genres", label: "ژانرها", icon: "Tags" },
  { href: "/admin/comments", label: "نظرات", icon: "MessageSquare" },
  { href: "/admin/users", label: "کاربران", icon: "Users" },
  { href: "/admin/coin-packages", label: "پکیج‌های سکه", icon: "Coins" },
  { href: "/admin/transactions", label: "تراکنش‌ها", icon: "Receipt" },
  { href: "/admin/analytics", label: "آمار", icon: "BarChart3" },
  { href: "/admin/payouts", label: "تسویه‌حساب ناشران", icon: "Wallet" },
  { href: "/admin/notices", label: "اعلان‌ها", icon: "Megaphone" },
  { href: "/admin/logs", label: "لاگ سیستم", icon: "ScrollText" },
  { href: "/admin/settings", label: "تنظیمات سراسری", icon: "LayoutDashboard" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
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