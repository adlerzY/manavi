"use client";

import { useState, type ReactNode } from "react";
import { Settings } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";

export function SettingsSheet({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="تنظیمات"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-text-main"
      >
        <Settings size={18} />
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="تنظیمات">
        {children}
      </BottomSheet>
    </>
  );
}