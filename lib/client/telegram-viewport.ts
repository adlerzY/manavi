const SDK_WAIT_TIMEOUT_MS = 6000;
const SDK_POLL_INTERVAL_MS = 50;

export const SAFE_AREA_EVENTS = ["safeAreaChanged", "contentSafeAreaChanged", "fullscreenChanged"] as const;

export function waitForTelegramWebApp(): Promise<TelegramWebApp | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }
    if (window.Telegram?.WebApp) {
      resolve(window.Telegram.WebApp);
      return;
    }

    const startedAt = Date.now();
    const interval = setInterval(() => {
      if (window.Telegram?.WebApp) {
        clearInterval(interval);
        resolve(window.Telegram.WebApp);
        return;
      }
      if (Date.now() - startedAt > SDK_WAIT_TIMEOUT_MS) {
        clearInterval(interval);
        resolve(null);
      }
    }, SDK_POLL_INTERVAL_MS);
  });
}

export function applySafeAreaCssVars(webApp: TelegramWebApp): void {
  const root = document.documentElement;
  const safeArea = webApp.safeAreaInset;
  const contentSafeArea = webApp.contentSafeAreaInset;
  const sides = ["top", "bottom", "left", "right"] as const;

  for (const side of sides) {
    const device = safeArea?.[side] ?? 0;
    const telegramUi = contentSafeArea?.[side] ?? 0;
    root.style.setProperty(`--tg-safe-area-${side}`, `${device}px`);
    root.style.setProperty(`--tg-content-safe-area-${side}`, `${device + telegramUi}px`);
  }
}