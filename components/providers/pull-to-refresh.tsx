"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const THRESHOLD_PX = 72;
const MAX_PULL_PX = 110;
const ACTIVATION_PX = 8;
const RESISTANCE = 0.5;
const COOLDOWN_MS = 8000;
const MIN_SPIN_MS = 900;

type Phase = "idle" | "pulling" | "ready" | "cooldown" | "refreshing";

function shouldIgnore(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body) {
    if (node.hasAttribute("data-no-ptr")) return true;
    const style = window.getComputedStyle(node);
    if (style.position === "fixed") return true;
    const scrollable = style.overflowY === "auto" || style.overflowY === "scroll";
    if (scrollable && node.scrollHeight > node.clientHeight && node.scrollTop > 0) return true;
    node = node.parentElement;
  }
  return false;
}

export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const pullRef = useRef(0);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const lastRefreshRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    function changePhase(next: Phase) {
      phaseRef.current = next;
      setPhase(next);
    }

    function reset() {
      startRef.current = null;
      pullRef.current = 0;
      setPull(0);
      if (phaseRef.current !== "refreshing") changePhase("idle");
    }

    function onTouchStart(event: TouchEvent) {
      if (phaseRef.current === "refreshing" || event.touches.length !== 1) return;
      if (window.scrollY > 0 || shouldIgnore(event.target)) {
        startRef.current = null;
        return;
      }
      const touch = event.touches[0];
      startRef.current = { x: touch.clientX, y: touch.clientY };
    }

    function onTouchMove(event: TouchEvent) {
      const start = startRef.current;
      if (!start) return;

      const touch = event.touches[0];
      const dy = touch.clientY - start.y;
      const dx = touch.clientX - start.x;

      if (window.scrollY > 0 || dy < 0 || Math.abs(dx) > Math.abs(dy) * 1.2) {
        reset();
        return;
      }
      if (dy < ACTIVATION_PX) return;

      const distance = Math.min(MAX_PULL_PX, (dy - ACTIVATION_PX) * RESISTANCE);
      pullRef.current = distance;

      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null;
          setPull(pullRef.current);
        });
      }

      const next: Phase =
        Date.now() - lastRefreshRef.current < COOLDOWN_MS ? "cooldown" : distance >= THRESHOLD_PX ? "ready" : "pulling";
      if (phaseRef.current !== next) changePhase(next);
    }

    function onTouchEnd() {
      const current = phaseRef.current;
      startRef.current = null;

      if (current === "ready") {
        lastRefreshRef.current = Date.now();
        changePhase("refreshing");
        pullRef.current = THRESHOLD_PX * 0.7;
        setPull(pullRef.current);
        router.refresh();
        window.setTimeout(() => {
          pullRef.current = 0;
          setPull(0);
          changePhase("idle");
        }, MIN_SPIN_MS);
        return;
      }

      pullRef.current = 0;
      setPull(0);
      if (current !== "refreshing") changePhase("idle");
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [router]);

  const visible = pull > 0 || phase === "refreshing";
  const progress = Math.min(1, pull / THRESHOLD_PX);
  const animating = phase === "idle" || phase === "refreshing";
  const label =
    phase === "refreshing"
      ? "در حال به‌روزرسانی…"
      : phase === "cooldown"
      ? "چند ثانیه بعد دوباره امتحان کن"
      : phase === "ready"
      ? "رها کن تا به‌روز شود"
      : "بکش پایین برای به‌روزرسانی";

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 z-[45] flex justify-center"
      style={{
        top: "calc(var(--tg-content-safe-area-top, 0px) + 8px)",
        transform: `translateY(${pull - 56}px)`,
        opacity: visible ? 1 : 0,
        transition: animating ? "transform 220ms ease, opacity 220ms ease" : "none",
      }}
    >
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface/95 px-3 py-2 text-xs text-text-main shadow-lg">
        <RefreshCw
          size={16}
          className={phase === "refreshing" ? "animate-spin text-primary" : "text-text-muted"}
          style={phase === "refreshing" ? undefined : { transform: `rotate(${progress * 270}deg)` }}
        />
        {label}
      </div>
    </div>
  );
}