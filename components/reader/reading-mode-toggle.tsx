"use client";

import type { ReadingMode } from "@prisma/client";

interface ReadingModeToggleProps {
  mode: ReadingMode;
  onChange: (mode: ReadingMode) => void;
}

function buttonClass(active: boolean, extra = "flex"): string {
  return `${extra} h-10 w-10 items-center justify-center rounded-full ${active ? "bg-white/20 text-white" : "text-white/50"}`;
}

export function ReadingModeToggle({ mode, onChange }: ReadingModeToggleProps) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-black/40 p-1">
      <button onClick={() => onChange("VERTICAL")} aria-label="حالت اسکرول عمودی" aria-pressed={mode === "VERTICAL"} className={buttonClass(mode === "VERTICAL")}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="3" width="14" height="6" rx="1" />
          <rect x="5" y="15" width="14" height="6" rx="1" />
        </svg>
      </button>
      <button onClick={() => onChange("HORIZONTAL")} aria-label="حالت صفحه‌بندی افقی" aria-pressed={mode === "HORIZONTAL"} className={buttonClass(mode === "HORIZONTAL")}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="6" height="14" rx="1" />
          <rect x="15" y="5" width="6" height="14" rx="1" />
        </svg>
      </button>
      <button onClick={() => onChange("DOUBLE_PAGE")} aria-label="حالت دو صفحه‌ای" aria-pressed={mode === "DOUBLE_PAGE"} className={buttonClass(mode === "DOUBLE_PAGE", "hidden sm:flex")}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="5" width="9" height="14" rx="1" />
          <rect x="13" y="5" width="9" height="14" rx="1" />
        </svg>
      </button>
    </div>
  );
}