"use client";

import { useEffect } from "react";
import { initTelegramShell, waitForTelegramWebApp } from "@/lib/client/telegram-viewport";

export function TelegramPanelViewport() {
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    waitForTelegramWebApp().then((webApp) => {
      if (!webApp || cancelled) return;
      cleanup = initTelegramShell(webApp, { fullscreen: false });
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}