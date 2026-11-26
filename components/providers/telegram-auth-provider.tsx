"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { initTelegramShell, waitForTelegramWebApp } from "@/lib/client/telegram-viewport";

interface AuthUser {
  id: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  role: string;
  activeTitle: string | null;
}

export type AuthStatus = "loading" | "ready" | "guest" | "error";
export type AuthErrorReason = "cookies-blocked" | "failed" | null;

interface AuthSnapshot {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
  reason: AuthErrorReason;
}

interface TelegramAuthState extends AuthSnapshot {
  retry: () => void;
}

const LOADING: AuthSnapshot = { status: "loading", user: null, error: null, reason: null };

const TelegramAuthContext = createContext<TelegramAuthState>({ ...LOADING, retry: () => {} });

export function useTelegramAuth() {
  return useContext(TelegramAuthContext);
}

const AUTH_TIMEOUT_MS = 15000;

async function readSession(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return null;
    const body = await res.json();
    return (body.user as AuthUser | null) ?? null;
  } catch {
    return null;
  }
}

export function TelegramAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<AuthSnapshot>(LOADING);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setSnapshot(LOADING);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    waitForTelegramWebApp().then((webApp) => {
      if (!webApp || cancelled) return;
      cleanup = initTelegramShell(webApp);
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

    async function authenticate() {
      const webApp = await waitForTelegramWebApp();
      if (cancelled) return;

      const initData = webApp?.initData;
      if (!initData) {
        const existing = await readSession();
        if (cancelled) return;
        setSnapshot(
          existing
            ? { status: "ready", user: existing, error: null, reason: null }
            : { status: "guest", user: null, error: null, reason: null }
        );
        return;
      }

      try {
        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ initData }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(typeof body.error === "string" ? body.error : "ورود انجام نشد");
        }

        const { fresh } = (await res.json()) as { fresh?: boolean };
        const confirmed = await readSession();
        if (cancelled) return;

        if (!confirmed) {
          setSnapshot({
            status: "error",
            user: null,
            error: "مرورگر اجازه‌ی ذخیره‌ی نشست داخل وب تلگرام را نمی‌دهد.",
            reason: "cookies-blocked",
          });
          return;
        }

        setSnapshot({ status: "ready", user: confirmed, error: null, reason: null });
        if (fresh) router.refresh();
      } catch (err) {
        if (cancelled) return;
        setSnapshot({
          status: "error",
          user: null,
          error: err instanceof Error && err.name !== "AbortError" ? err.message : "ارتباط با سرور برقرار نشد.",
          reason: "failed",
        });
      } finally {
        clearTimeout(timeout);
      }
    }

    authenticate();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt, router]);

  return <TelegramAuthContext.Provider value={{ ...snapshot, retry }}>{children}</TelegramAuthContext.Provider>;
}