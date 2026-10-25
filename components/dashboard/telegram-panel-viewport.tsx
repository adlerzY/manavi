"use client";

import { useEffect } from "react";
import { applySafeAreaCssVars, waitForTelegramWebApp, SAFE_AREA_EVENTS } from "@/lib/client/telegram-viewport";

export function TelegramPanelViewport() {
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    waitForTelegramWebApp().then((webApp) => {
      if (!webApp || cancelled) return;

      try {
        webApp.ready();
        webApp.expand();
      } catch {}

      const syncSafeArea = () => applySafeAreaCssVars(webApp);
      const leaveFullscreen = () => {
        if (webApp.isFullscreen) {
          try {
            webApp.exitFullscreen?.();
          } catch {}
        }
        syncSafeArea();
      };

      leaveFullscreen();

      SAFE_AREA_EVENTS.forEach((eventName) => {
        try {
          webApp.onEvent(eventName, eventName === "fullscreenChanged" ? leaveFullscreen : syncSafeArea);
        } catch {}
      });

      cleanup = () => {
        SAFE_AREA_EVENTS.forEach((eventName) => {
          try {
            webApp.offEvent(eventName, eventName === "fullscreenChanged" ? leaveFullscreen : syncSafeArea);
          } catch {}
        });
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}