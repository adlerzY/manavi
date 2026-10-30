"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  FileSignature,
  BookOpen,
  Users,
  Receipt,
  BarChart3,
  Wallet,
  Megaphone,
  Tags,
  Layers,
  UserCircle,
  MessageSquare,
  Gem,
  Coins,
  CheckCircle2,
  ScrollText,
  Settings,
  Home,
  User,
  Menu,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Building2, FileSignature, BookOpen, Users, Receipt,
  BarChart3, Wallet, Megaphone, Tags, Layers, UserCircle, MessageSquare, Gem, Coins, CheckCircle2, ScrollText, Settings,
};

export interface SidebarNavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  group?: string;
  badge?: number;
}

interface SidebarNavProps {
  items: SidebarNavItem[];
  title: string;
}

const FOOTER_LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/app", label: "بازگشت به اپ", icon: Home },
];

function formatBadge(value: number): string {
  return value > 99 ? "۹۹+" : value.toLocaleString("fa-IR");
}

function ToggleIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-300 ${open ? "" : "rotate-180"}`}
    >
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M14 4v16" />
      <path d="M17.5 10.5 19.5 12 17.5 13.5" />
    </svg>
  );
}

export function SidebarNav({ items, title }: SidebarNavProps) {
  const pathname = usePathname();
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const expanded = pinned || hovered || mobileOpen;
  const totalBadge = items.reduce((sum, item) => sum + (item.badge ?? 0), 0);

  function isActive(href: string) {
    return href === items[0].href ? pathname === href : pathname.startsWith(href);
  }

  return (
    <>
      <header
        style={{ paddingTop: "var(--tg-content-safe-area-top, 0px)" }}
        className="sticky top-0 z-40 border-b border-border bg-surface sm:hidden"
      >
        <div className="flex h-14 items-center gap-2 px-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md text-text-main active:bg-background"
            aria-label={totalBadge > 0 ? `باز کردن منو، ${totalBadge.toLocaleString("fa-IR")} مورد نیازمند اقدام` : "باز کردن منو"}
          >
            <Menu size={22} />
            {totalBadge > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-accent" />}
          </button>
          <span className="min-w-0 truncate text-sm font-medium text-text-main">{title}</span>
          <Link
            href="/app"
            aria-label="صفحه اصلی اپ"
            className="ms-auto flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md text-text-muted active:bg-background"
          >
            <Home size={20} />
          </Link>
          <Link
            href="/app/profile"
            aria-label="پروفایل من"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md text-text-muted active:bg-background"
          >
            <User size={20} />
          </Link>
        </div>
      </header>

      <div
        onClick={() => setMobileOpen(false)}
        className={`fixed inset-0 z-50 bg-black/60 transition-opacity duration-200 sm:hidden ${mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ paddingTop: "var(--tg-content-safe-area-top, 0px)" }}
        className={`fixed inset-y-0 right-0 z-50 flex flex-col border-l border-border bg-surface transition-all duration-300 ease-out max-w-[85vw]
          ${mobileOpen ? "translate-x-0" : "translate-x-full sm:translate-x-0"}
          ${expanded ? "w-64" : "w-[68px]"}`}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-3">
          <span className={`overflow-hidden whitespace-nowrap text-sm font-medium text-text-main transition-opacity duration-200 ${expanded ? "opacity-100" : "opacity-0"}`}>
            {title}
          </span>
          <button
            onClick={() => setMobileOpen(false)}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-background hover:text-text-main sm:hidden"
            aria-label="بستن منو"
          >
            <X size={20} />
          </button>
          <button
            onClick={() => setPinned((prev) => !prev)}
            className="hidden flex-shrink-0 rounded-md p-1.5 text-text-muted hover:bg-background hover:text-text-main sm:block"
            aria-label={pinned ? "جمع کردن منو" : "باز کردن منو"}
          >
            <ToggleIcon open={pinned} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-2.5">
          {items.map((item, index) => {
            const active = isActive(item.href);
            const Icon = ICONS[item.icon];
            const startsGroup = Boolean(item.group) && item.group !== items[index - 1]?.group;
            const badge = item.badge ?? 0;
            return (
              <div key={item.href}>
                {startsGroup && (
                  <p
                    className={`overflow-hidden whitespace-nowrap px-3 pb-1 text-[11px] text-text-muted transition-opacity duration-200 ${
                      index === 0 ? "pt-0" : "pt-4"
                    } ${expanded ? "opacity-100" : "opacity-0"}`}
                  >
                    {item.group}
                  </p>
                )}
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  aria-label={badge > 0 ? `${item.label}، ${badge.toLocaleString("fa-IR")} مورد` : undefined}
                  className={`flex items-center gap-3 rounded-md px-3 py-3 text-sm transition-colors sm:py-2.5 ${
                    active ? "bg-primary/10 text-primary" : "text-text-main hover:bg-background"
                  }`}
                >
                  {Icon && (
                    <span className="relative flex-shrink-0">
                      <Icon size={19} strokeWidth={active ? 2.4 : 1.8} />
                      {badge > 0 && !expanded && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-accent" />}
                    </span>
                  )}
                  <span className={`overflow-hidden whitespace-nowrap transition-opacity duration-200 ${expanded ? "opacity-100" : "opacity-0"}`}>
                    {item.label}
                  </span>
                  {badge > 0 && expanded && (
                    <span className="ms-auto flex-shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] leading-4 text-accent-foreground">
                      {formatBadge(badge)}
                    </span>
                  )}
                </Link>
              </div>
            );
          })}
        </nav>

        <div
          style={{ paddingBottom: "calc(10px + var(--tg-safe-area-bottom, 0px))" }}
          className="space-y-1 border-t border-border px-2.5 pt-2.5"
        >
          {FOOTER_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-3 text-sm text-text-muted transition-colors hover:bg-background hover:text-text-main sm:py-2.5"
            >
              <Icon size={19} strokeWidth={1.8} className="flex-shrink-0" />
              <span className={`overflow-hidden whitespace-nowrap transition-opacity duration-200 ${expanded ? "opacity-100" : "opacity-0"}`}>
                {label}
              </span>
            </Link>
          ))}
        </div>
      </aside>
    </>
  );
}