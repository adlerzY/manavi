import type { ReactNode } from "react";
import { Suspense } from "react";
import { BottomNav } from "@/components/navigation/bottom-nav";
import { SwipeBackListener } from "@/components/navigation/swipe-back-listener";
import { PullToRefresh } from "@/components/providers/pull-to-refresh";
import { SiteNoticeBanner } from "@/components/home/site-notice-banner";

export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col pb-[calc(72px+max(env(safe-area-inset-bottom),var(--tg-safe-area-bottom,0px)))] pt-[var(--tg-content-safe-area-top,0px)]">
      <SwipeBackListener />
      <PullToRefresh />
      <Suspense fallback={null}>
        <SiteNoticeBanner />
      </Suspense>
      {children}
      <BottomNav />
    </div>
  );
}