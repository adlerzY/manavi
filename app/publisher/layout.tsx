import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser, getPublisherContext } from "@/lib/auth";
import { SidebarNav, type SidebarNavItem } from "@/components/dashboard/sidebar-nav";
import { TelegramWebAppScript } from "@/components/telegram-web-app-script";
import { TelegramPanelViewport } from "@/components/dashboard/telegram-panel-viewport";

export default async function PublisherLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const context = await getPublisherContext(user);
  if (!context && user.role !== "ADMIN") {
    redirect("/app/profile");
  }

  const NAV: SidebarNavItem[] = [
    { href: "/publisher", label: "داشبورد", icon: "LayoutDashboard" },
    { href: "/publisher/comics", label: "آثار من", icon: "BookOpen" },
    { href: "/publisher/comments", label: "نظرات", icon: "MessageSquare" },
    { href: "/publisher/earnings", label: "درآمد و تسویه", icon: "Wallet" },
  ];

  if (!context || context.isOwner) {
    NAV.push(
      { href: "/publisher/profile", label: "پروفایل", icon: "UserCircle" },
      { href: "/publisher/team", label: "تیم", icon: "Users" }
    );
  }

  return (
    <div className="min-h-screen bg-background sm:pr-[68px]">
      <TelegramWebAppScript />
      <TelegramPanelViewport />
      <SidebarNav items={NAV} title="پنل ناشر مناوی" />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}