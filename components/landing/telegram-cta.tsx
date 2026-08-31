"use client";

import { useState, useEffect } from "react";

const MOBILE_UA_PATTERN = /android|iphone|ipad|ipod|iemobile|blackberry|opera mini|mobile/i;
const NATIVE_APP_FALLBACK_MS = 1500;

interface TelegramCtaProps {
  webLink: string;
  nativeLink: string;
}

export function TelegramCta({ webLink, nativeLink }: TelegramCtaProps) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    setIsMobile(MOBILE_UA_PATTERN.test(navigator.userAgent));
  }, []);

  function handleOpenClick() {
    if (!isMobile) {
      window.open(webLink, "_blank", "noopener,noreferrer");
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
      window.location.href = webLink;
    }, NATIVE_APP_FALLBACK_MS);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    window.location.href = nativeLink;
  }

  if (isMobile === null) {
    return <div className="h-14 w-full max-w-xs rounded-md bg-surface" />;
  }

  return (
    <button
      onClick={handleOpenClick}
      className="flex w-full max-w-xs items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
    >
      باز کردن مینی‌اپ در تلگرام
    </button>
  );
}