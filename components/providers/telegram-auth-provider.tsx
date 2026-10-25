"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { applySafeAreaCssVars, waitForTelegramWebApp, SAFE_AREA_EVENTS } from "@/lib/client/telegram-viewport";

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

const AUTH_TIMEOUT_MS = 12000;

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