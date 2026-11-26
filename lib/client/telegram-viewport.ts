const SDK_WAIT_TIMEOUT_MS = 4000;
const SDK_POLL_INTERVAL_MS = 50;
const SAFE_AREA_STORAGE_KEY = "manavi-safe-area:v1";
const SETTLE_DELAYS_MS = [0, 150, 400, 900, 1800];
const SHELL_COLOR = "#121212";
const FULLSCREEN_PLATFORMS = new Set(["android", "android_x", "ios"]);
const SIDES = ["top", "bottom", "left", "right"] as const;

export const SAFE_AREA_EVENTS = ["safeAreaChanged", "contentSafeAreaChanged", "fullscreenChanged", "viewportChanged"] as const;

type ShellWebApp = TelegramWebApp & {
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
};

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

export function applySafeAreaCssVars(webApp: TelegramWebApp, persist = true): void {
  const root = document.documentElement;
  const vars: Record<string, string> = {};

  for (const side of SIDES) {
    const device = webApp.safeAreaInset?.[side] ?? 0;
    const telegramUi = webApp.contentSafeAreaInset?.[side] ?? 0;
    vars[`--tg-safe-area-${side}`] = `${device}px`;
    vars[`--tg-content-safe-area-${side}`] = `${device + telegramUi}px`;
  }

  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);

  if (!persist) return;
  try {
    window.localStorage.setItem(SAFE_AREA_STORAGE_KEY, JSON.stringify(vars));
  } catch {}
}

export function initTelegramShell(webApp: TelegramWebApp, options: { fullscreen?: boolean } = {}): () => void {
  const app = webApp as ShellWebApp;
  const wantsFullscreen = options.fullscreen ?? true;

  try {
    app.ready();
    app.expand();
  } catch {}

  try {
    app.disableVerticalSwipes?.();
  } catch {}

  try {
    app.setHeaderColor?.(SHELL_COLOR);
    app.setBackgroundColor?.(SHELL_COLOR);
    app.setBottomBarColor?.(SHELL_COLOR);
  } catch {}

  if (wantsFullscreen && FULLSCREEN_PLATFORMS.has(app.platform ?? "") && !app.isFullscreen) {
    try {
      app.requestFullscreen?.();
    } catch {}
  }

  const handleChange = () => {
    try {
      if (app.isExpanded === false) app.expand();
    } catch {}
    applySafeAreaCssVars(app, true);
  };

  applySafeAreaCssVars(app, false);

  const timers = SETTLE_DELAYS_MS.map((delay, index) =>
    window.setTimeout(() => applySafeAreaCssVars(app, index === SETTLE_DELAYS_MS.length - 1), delay)
  );

  SAFE_AREA_EVENTS.forEach((eventName) => {
    try {
      app.onEvent(eventName, handleChange);
    } catch {}
  });

  return () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    SAFE_AREA_EVENTS.forEach((eventName) => {
      try {
        app.offEvent(eventName, handleChange);
      } catch {}
    });
  };
}