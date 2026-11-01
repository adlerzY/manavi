"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

export type MessageKind = "success" | "error" | "info" | "warning";

export interface MessageInput {
  message: string;
  title?: string;
  kind?: MessageKind;
}

export interface ConfirmInput {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PromptInput {
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  confirmLabel?: string;
  initialValue?: string;
  minLength?: number;
  maxLength?: number;
  multiline?: boolean;
}

type QueueItem =
  | { id: number; type: "message"; kind: MessageKind; title: string; message: string; signature: string }
  | { id: number; type: "confirm"; input: ConfirmInput; resolve: (value: boolean) => void }
  | { id: number; type: "prompt"; input: PromptInput; resolve: (value: string | null) => void };

interface SystemMessageApi {
  notify: (input: MessageInput) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  confirm: (input: ConfirmInput) => Promise<boolean>;
  prompt: (input: PromptInput) => Promise<string | null>;
}

const MAX_QUEUED_MESSAGES = 4;
const DEDUPE_WINDOW_MS = 3000;
const SUCCESS_AUTO_CLOSE_MS = 4500;

const DEFAULT_TITLES: Record<MessageKind, string> = {
  success: "انجام شد",
  error: "خطا",
  info: "اطلاعیه",
  warning: "هشدار",
};

const KIND_TONES: Record<MessageKind, string> = {
  success: "bg-primary/10 text-primary",
  error: "bg-red-500/10 text-red-400",
  info: "bg-accent/10 text-accent",
  warning: "bg-accent/10 text-accent",
};

function KindIcon({ kind }: { kind: MessageKind }) {
  if (kind === "success") return <CheckCircle2 size={28} />;
  if (kind === "error") return <XCircle size={28} />;
  if (kind === "warning") return <AlertTriangle size={28} />;
  return <Info size={28} />;
}

const SystemMessageContext = createContext<SystemMessageApi | null>(null);

export function useSystemMessage(): SystemMessageApi {
  const context = useContext(SystemMessageContext);
  if (!context) throw new Error("useSystemMessage must be used within SystemMessageProvider");
  return context;
}

function ActiveDialog({ item, onResolve }: { item: QueueItem; onResolve: (value: boolean | string | null) => void }) {
  const [value, setValue] = useState(item.type === "prompt" ? item.input.initialValue ?? "" : "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const cancelValue = item.type === "confirm" ? false : item.type === "prompt" ? null : true;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onResolve(cancelValue);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [item.type, onResolve]);

  useEffect(() => {
    if (item.type !== "message" || item.kind !== "success") return;
    const timer = setTimeout(() => onResolve(true), SUCCESS_AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [item, onResolve]);

  const kind: MessageKind = item.type === "message" ? item.kind : item.type === "confirm" && item.input.danger ? "warning" : "info";
  const title = item.type === "message" ? item.title : item.input.title;
  const message = item.type === "message" ? item.message : item.input.message;

  function handlePromptSubmit(event: FormEvent) {
    event.preventDefault();
    if (item.type !== "prompt") return;
    const trimmed = value.trim();
    const min = item.input.minLength ?? 1;
    if (trimmed.length < min) {
      setError(min <= 1 ? "این مورد الزامی است" : `حداقل ${min.toLocaleString("fa-IR")} کاراکتر وارد کنید`);
      return;
    }
    onResolve(trimmed);
  }

  const primaryClass =
    item.type === "confirm" && item.input.danger
      ? "min-h-11 flex-1 rounded-xl bg-red-500 px-4 text-sm font-medium text-white"
      : "min-h-11 flex-1 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground";
  const secondaryClass = "min-h-11 flex-1 rounded-xl border border-border px-4 text-sm text-text-main";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4"
      role="presentation"
      onClick={() => {
        if (item.type === "message") onResolve(true);
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-5 text-center shadow-2xl"
      >
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${KIND_TONES[kind]}`}>
          <KindIcon kind={kind} />
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-text-main">{title}</h2>
          {message && <p className="whitespace-pre-line text-sm leading-7 text-text-muted">{message}</p>}
        </div>

        {item.type === "message" && (
          <button type="button" autoFocus onClick={() => onResolve(true)} className={`${primaryClass} w-full`}>
            باشه
          </button>
        )}

        {item.type === "confirm" && (
          <div className="flex gap-2">
            <button type="button" autoFocus={item.input.danger} onClick={() => onResolve(false)} className={secondaryClass}>
              {item.input.cancelLabel ?? "انصراف"}
            </button>
            <button type="button" autoFocus={!item.input.danger} onClick={() => onResolve(true)} className={primaryClass}>
              {item.input.confirmLabel ?? "تأیید"}
            </button>
          </div>
        )}

        {item.type === "prompt" && (
          <form onSubmit={handlePromptSubmit} className="space-y-3 text-right">
            <div className="space-y-1">
              {item.input.label && <label className="text-xs text-text-muted">{item.input.label}</label>}
              {item.input.multiline ? (
                <textarea
                  autoFocus
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value);
                    setError(null);
                  }}
                  rows={3}
                  maxLength={item.input.maxLength}
                  placeholder={item.input.placeholder}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
                />
              ) : (
                <input
                  autoFocus
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value);
                    setError(null);
                  }}
                  maxLength={item.input.maxLength}
                  placeholder={item.input.placeholder}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
                />
              )}
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => onResolve(null)} className={secondaryClass}>
                انصراف
              </button>
              <button type="submit" className={primaryClass}>
                {item.input.confirmLabel ?? "ثبت"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}

export function SystemMessageProvider({ children }: { children: ReactNode }) {
  const queueRef = useRef<QueueItem[]>([]);
  const idRef = useRef(0);
  const recentRef = useRef(new Map<string, number>());
  const [queue, setQueue] = useState<QueueItem[]>([]);

  const commit = useCallback((next: QueueItem[]) => {
    queueRef.current = next;
    setQueue(next);
  }, []);

  const notify = useCallback(
    (input: MessageInput) => {
      const message = input.message?.trim();
      if (!message) return;

      const kind = input.kind ?? "info";
      const title = input.title ?? DEFAULT_TITLES[kind];
      const signature = `${kind}|${title}|${message}`;
      const now = Date.now();

      for (const [key, at] of recentRef.current) {
        if (now - at > DEDUPE_WINDOW_MS) recentRef.current.delete(key);
      }
      if (recentRef.current.has(signature)) return;

      const current = queueRef.current;
      if (current.some((entry) => entry.type === "message" && entry.signature === signature)) return;
      if (current.filter((entry) => entry.type === "message").length >= MAX_QUEUED_MESSAGES) return;

      recentRef.current.set(signature, now);
      commit([...current, { id: ++idRef.current, type: "message", kind, title, message, signature }]);
    },
    [commit]
  );

  const confirm = useCallback(
    (input: ConfirmInput) =>
      new Promise<boolean>((resolve) => {
        commit([...queueRef.current, { id: ++idRef.current, type: "confirm", input, resolve }]);
      }),
    [commit]
  );

  const prompt = useCallback(
    (input: PromptInput) =>
      new Promise<string | null>((resolve) => {
        commit([...queueRef.current, { id: ++idRef.current, type: "prompt", input, resolve }]);
      }),
    [commit]
  );

  const resolveActive = useCallback(
    (value: boolean | string | null) => {
      const [active, ...rest] = queueRef.current;
      if (!active) return;
      commit(rest);
      if (active.type === "confirm") active.resolve(value === true);
      else if (active.type === "prompt") active.resolve(typeof value === "string" ? value : null);
    },
    [commit]
  );

  const api = useMemo<SystemMessageApi>(
    () => ({
      notify,
      success: (message, title) => notify({ message, title, kind: "success" }),
      error: (message, title) => notify({ message, title, kind: "error" }),
      info: (message, title) => notify({ message, title, kind: "info" }),
      warning: (message, title) => notify({ message, title, kind: "warning" }),
      confirm,
      prompt,
    }),
    [notify, confirm, prompt]
  );

  const active = queue[0];

  return (
    <SystemMessageContext.Provider value={api}>
      {children}
      {active && <ActiveDialog key={active.id} item={active} onResolve={resolveActive} />}
    </SystemMessageContext.Provider>
  );
}