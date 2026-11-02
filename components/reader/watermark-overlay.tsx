"use client";

export function WatermarkOverlay({ label }: { label?: string | null }) {
  if (!label) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed bottom-3 left-3 z-20 select-none rounded bg-black/25 px-2 py-1 text-[10px] text-white/25"
    >
      {label}
    </div>
  );
}