"use client";

import type { ReactNode } from "react";
import { openGuide, type GuideId } from "@/lib/guide";

interface GuideLauncherProps {
  guide: GuideId;
  label: string;
  icon: ReactNode;
}

export function GuideLauncher({ guide, label, icon }: GuideLauncherProps) {
  return (
    <button
      type="button"
      onClick={() => openGuide(guide)}
      className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-1 py-2.5 active:bg-background"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span>
      <span className="text-[11px] text-text-main">{label}</span>
    </button>
  );
}