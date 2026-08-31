"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

interface GlowCtaButtonProps {
  href?: string;
  nativeHref?: string;
  variant?: "primary" | "secondary";
  children: ReactNode;
}

const MOBILE_UA_PATTERN = /android|iphone|ipad|ipod|iemobile|blackberry|opera mini|mobile/i;
const NATIVE_APP_FALLBACK_MS = 1500;

export function GlowCtaButton({ href = "/app", nativeHref, variant = "primary", children }: GlowCtaButtonProps) {
  const [isMobile, setIsMobile] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsMobile(MOBILE_UA_PATTERN.test(navigator.userAgent));
  }, []);

  function handleClick() {
    if (!href) return;

    const isInternal = href.startsWith("/");

    if (!isMobile || !nativeHref) {
      if (isInternal) {
        router.push(href);
      } else {
        window.location.href = href;
      }
      return;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearTimeout(fallbackTimer);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };

    const fallbackTimer = setTimeout(() => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (isInternal) {
        router.push(href);
      } else {
        window.location.href = href;
      }
    }, NATIVE_APP_FALLBACK_MS);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.location.href = nativeHref;
  }

  if (variant === "secondary") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={!href}
        className="w-full rounded-md border border-border bg-surface/60 px-6 py-3 text-center text-sm font-medium text-text-main backdrop-blur-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {children}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!href}
      className="group relative inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#00DC64] px-8 py-3.5 text-base font-bold text-black shadow-[0_0_20px_rgba(0,220,100,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#12e873] hover:shadow-[0_0_28px_rgba(0,220,100,0.5)] active:translate-y-0 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span>{children}</span>
      <svg
        className="h-4 w-4 stroke-[2.5] transition-transform duration-200 group-hover:-translate-x-1"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
      </svg>
    </button>
  );
}