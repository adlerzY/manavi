"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { Mascot, type MascotPose } from "@/components/ui/mascot";

export interface GuideStep {
  pose?: MascotPose;
  visual?: ReactNode;
  title: string;
  text: string;
}

interface GuideSheetProps {
  open: boolean;
  steps: GuideStep[];
  onClose: () => void;
  finishLabel?: string;
}

export function GuideSheet({ open, steps, onClose, finishLabel = "متوجه شدم" }: GuideSheetProps) {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || steps.length === 0) return null;

  const current = Math.min(index, steps.length - 1);
  const step = steps[current];
  const isFirst = current === 0;
  const isLast = current === steps.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={step.title}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/80 px-4 sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ marginBottom: "max(env(safe-area-inset-bottom), var(--tg-safe-area-bottom, 0px))" }}
        className="relative mb-4 w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-neutral-900 px-6 pb-5 pt-6 text-center"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-44"
          style={{ backgroundImage: "radial-gradient(ellipse at top, rgba(0,220,100,0.18), transparent 70%)" }}
        />

        <button
          type="button"
          onClick={onClose}
          aria-label="بستن راهنما"
          className="absolute left-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full text-white/60 hover:bg-white/10"
        >
          <X size={18} />
        </button>

        <motion.div
          key={current}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="relative"
        >
          <div className="flex h-44 items-center justify-center">
            {step.visual ?? <Mascot pose={step.pose ?? "wave"} size={170} float />}
          </div>
          <h2 className="mt-3 text-base font-semibold text-white">{step.title}</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-7 text-white/65">{step.text}</p>
        </motion.div>

        <div className="relative mt-5 flex items-center justify-center gap-1.5" aria-hidden>
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === current ? "w-5 bg-primary" : "w-1.5 bg-white/25"
              }`}
            />
          ))}
        </div>

        <div className="relative mt-5 flex gap-2">
          {!isFirst && (
            <button
              type="button"
              onClick={() => setIndex(current - 1)}
              className="min-h-11 w-24 rounded-xl border border-white/15 px-4 text-sm text-white/80"
            >
              قبلی
            </button>
          )}
          <button
            type="button"
            onClick={() => (isLast ? onClose() : setIndex(current + 1))}
            className="min-h-11 flex-1 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            {isLast ? finishLabel : "بعدی"}
          </button>
        </div>
      </div>
    </div>
  );
}