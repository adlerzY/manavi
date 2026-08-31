"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface AuthUser {
  id: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  role: string;
}

interface TelegramAuthState {
  status: "loading" | "ready" | "error";
  user: AuthUser | null;
  error: string | null;
}

const TelegramAuthContext = createContext<TelegramAuthState>({
  status: "loading",
  user: null,
  error: null,
});

export function useTelegramAuth() {
  return useContext(TelegramAuthContext);
}

const SDK_WAIT_TIMEOUT_MS = 6000;
const SDK_POLL_INTERVAL_MS = 50;
const AUTH_TIMEOUT_MS = 12000;

const SAFE_AREA_EVENTS = ["safeAreaChanged", "contentSafeAreaChanged", "fullscreenChanged"];

function waitForTelegramWebApp(): Promise<TelegramWebApp | null> {
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

function applySafeAreaCssVars(webApp: TelegramWebApp) {
  const root = document.documentElement;
  const safeArea = webApp.safeAreaInset;
  const contentSafeArea = webApp.contentSafeAreaInset;

  root.style.setProperty("--tg-safe-area-top", `${safeArea?.top ?? 0}px`);
  root.style.setProperty("--tg-safe-area-bottom", `${safeArea?.bottom ?? 0}px`);
  root.style.setProperty("--tg-safe-area-left", `${safeArea?.left ?? 0}px`);
  root.style.setProperty("--tg-safe-area-right", `${safeArea?.right ?? 0}px`);

  root.style.setProperty("--tg-content-safe-area-top", `${contentSafeArea?.top ?? safeArea?.top ?? 0}px`);
  root.style.setProperty("--tg-content-safe-area-bottom", `${contentSafeArea?.bottom ?? safeArea?.bottom ?? 0}px`);
  root.style.setProperty("--tg-content-safe-area-left", `${contentSafeArea?.left ?? safeArea?.left ?? 0}px`);
  root.style.setProperty("--tg-content-safe-area-right", `${contentSafeArea?.right ?? safeArea?.right ?? 0}px`);
}

function setupTelegramViewport(webApp: TelegramWebApp): () => void {
  try {
    webApp.ready();
    webApp.expand();
  } catch {}

  applySafeAreaCssVars(webApp);

  try {
    webApp.requestFullscreen?.();
  } catch {}

  const handleChange = () => applySafeAreaCssVars(webApp);
  SAFE_AREA_EVENTS.forEach((eventName) => {
    try {
      webApp.onEvent(eventName, handleChange);
    } catch {}
  });

  return () => {
    SAFE_AREA_EVENTS.forEach((eventName) => {
      try {
        webApp.offEvent(eventName, handleChange);
      } catch {}
    });
  };
}

export function TelegramAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TelegramAuthState>({
    status: "loading",
    user: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    let cleanupViewport: (() => void) | null = null;

    async function authenticate() {
      const webApp = await waitForTelegramWebApp();

      if (cancelled) return;

      if (!webApp) {
        setState({
          status: "error",
          user: null,
          error: "Telegram WebApp SDK not found — open this app from Telegram.",
        });
        return;
      }

      cleanupViewport = setupTelegramViewport(webApp);

      const initData = webApp.initData;
      if (!initData) {
        if (!cancelled) {
          setState({
            status: "error",
            user: null,
            error: "No initData available from Telegram.",
          });
        }
        return;
      }

      try {
        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Auth request failed (${res.status})`);
        }

        const { user } = await res.json();
        if (!cancelled) {
          setState({ status: "ready", user, error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            user: null,
            error: err instanceof Error ? err.message : "Unknown auth error",
          });
        }
      }
    }

    const timeout = setTimeout(() => {
      if (!cancelled) {
        setState((prev) =>
          prev.status === "loading"
            ? { status: "error", user: null, error: "Auth timed out." }
            : prev
        );
      }
    }, AUTH_TIMEOUT_MS);

    authenticate();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      cleanupViewport?.();
    };
  }, []);

  return (
    <TelegramAuthContext.Provider value={state}>
      {children}
    </TelegramAuthContext.Provider>
  );
}