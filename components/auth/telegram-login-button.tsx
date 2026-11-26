"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { waitForTelegramWebApp } from "@/lib/client/telegram-viewport";

type Phase = "idle" | "creating" | "waiting" | "error";

const POLL_INTERVAL_MS = 2000;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;

interface TelegramLoginButtonProps {
  label?: string;
  className?: string;
}

export function TelegramLoginButton({ label = "ورود با تلگرام", className }: TelegramLoginButtonProps) {
  const [insideTelegram, setInsideTelegram] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    let cancelled = false;
    setInsideTelegram(Boolean(window.Telegram?.WebApp?.initData));
    waitForTelegramWebApp().then((app) => {
      if (!cancelled) setInsideTelegram(Boolean(app?.initData));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const start = useCallback(async () => {
    stop();
    setPhase("creating");
    setError(null);

    try {
      const res = await fetch("/api/auth/login-link", { method: "POST", cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.nonce) {
        throw new Error(typeof body?.error === "string" ? body.error : "ساخت لینک ورود ناموفق بود");
      }

      const nonce = body.nonce as string;
      setLink(body.webLink as string);
      setPhase("waiting");
      window.open(body.webLink as string, "_blank", "noopener,noreferrer");

      const deadline = Date.now() + LOGIN_WINDOW_MS;
      let busy = false;

      timerRef.current = setInterval(async () => {
        if (busy) return;
        if (Date.now() > deadline) {
          stop();
          setPhase("error");
          setError("زمان ورود تمام شد. دوباره تلاش کن.");
          return;
        }
        busy = true;
        try {
          const poll = await fetch(`/api/auth/login-link?nonce=${nonce}`, { cache: "no-store" });
          const data = await poll.json().catch(() => null);
          if (data?.status === "approved") {
            stop();
            window.location.reload();
          } else if (data?.status === "expired") {
            stop();
            setPhase("error");
            setError("درخواست ورود منقضی شد. دوباره تلاش کن.");
          }
        } catch {
        } finally {
          busy = false;
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "ورود ناموفق بود");
    }
  }, [stop]);

  function cancel() {
    stop();
    setPhase("idle");
    setLink(null);
  }

  if (insideTelegram) return null;

  const primaryClass =
    className ??
    "flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60";

  if (phase === "waiting") {
    return (
      <div className="space-y-2 text-center">
        <p className="text-xs leading-6 text-text-muted">
          در تلگرام روی «تایید ورود» بزن؛ همین‌جا خودکار وارد می‌شوی.
        </p>
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className={primaryClass}>
            <Send size={16} />
            باز کردن تلگرام
          </a>
        )}
        <button type="button" onClick={cancel} className="min-h-10 text-xs text-text-muted">
          انصراف
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={start} disabled={phase === "creating"} className={primaryClass}>
        <Send size={16} />
        {phase === "creating" ? "در حال آماده‌سازی…" : label}
      </button>
      {phase === "error" && error && <p className="text-center text-xs text-red-400">{error}</p>}
    </div>
  );
}