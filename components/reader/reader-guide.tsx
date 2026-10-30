"use client";

import { GuideSheet, type GuideStep } from "@/components/guide/guide-sheet";

const ZONE_FILL = "rgba(0,220,100,0.22)";
const PING_STYLE = { transformBox: "fill-box", transformOrigin: "center" } as const;

function TapZones({ variant }: { variant: "controls" | "paging" }) {
  return (
    <svg viewBox="0 0 120 200" className="h-44 w-auto" fill="none" aria-hidden>
      <rect x="4" y="4" width="112" height="192" rx="18" fill="#0a0a0a" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
      <rect x="40" y="56" width="40" height="30" rx="4" fill="rgba(255,255,255,0.07)" />
      <rect x="40" y="94" width="40" height="46" rx="4" fill="rgba(255,255,255,0.07)" />
      {variant === "controls" ? (
        <>
          <rect x="28" y="40" width="64" height="120" rx="10" fill={ZONE_FILL} stroke="#00DC64" strokeDasharray="4 4" />
          <circle cx="60" cy="100" r="9" fill="#00DC64" />
          <circle cx="60" cy="100" r="9" fill="#00DC64" className="animate-ping" style={PING_STYLE} />
          <rect x="14" y="170" width="92" height="14" rx="7" fill="rgba(0,220,100,0.35)" />
        </>
      ) : (
        <>
          <rect x="10" y="40" width="24" height="120" rx="10" fill={ZONE_FILL} stroke="#00DC64" strokeDasharray="4 4" />
          <rect x="86" y="40" width="24" height="120" rx="10" fill={ZONE_FILL} stroke="#00DC64" strokeDasharray="4 4" />
          <path d="M26 92 L18 100 L26 108" stroke="#00DC64" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M94 92 L102 100 L94 108" stroke="#00DC64" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="98" cy="138" r="8" fill="#00DC64" />
          <circle cx="98" cy="138" r="8" fill="#00DC64" className="animate-ping" style={PING_STYLE} />
        </>
      )}
    </svg>
  );
}

const STEPS: GuideStep[] = [
  {
    pose: "reading",
    title: "به ریدر ماناوی خوش اومدی",
    text: "چند تا نکته‌ی کوتاه که خوندن رو راحت‌تر می‌کنه. هر موقع خواستی با دکمه‌ی ⓘ بالای صفحه دوباره ببینیش.",
  },
  {
    visual: <TapZones variant="controls" />,
    title: "یه ضربه وسط صفحه",
    text: "نوار پایین (چپتر قبلی و بعدی، لیست چپترها و خروج به صفحه‌ی اثر) نمایش داده یا پنهان می‌شه. با اسکرول به پایین جمع می‌شه و با اسکرول به بالا برمی‌گرده.",
  },
  {
    visual: <TapZones variant="paging" />,
    title: "ورق زدن",
    text: "توی حالت افقی و دوصفحه‌ای، کنار صفحه رو لمس کن یا انگشتت رو بکش. توی حالت عمودی فقط اسکرول کن.",
  },
  {
    pose: "point",
    title: "تغییر حالت مطالعه",
    text: "از بالای صفحه بین عمودی، افقی و دوصفحه‌ای جابه‌جا شو. هدر فقط اول چپتر هست؛ اگه وسط چپتر بودی یه‌کم به بالا برگرد.",
  },
  {
    pose: "celebrate",
    title: "آخر چپتر",
    text: "ریکشن بزن، نظر بذار، از مترجم‌ها حمایت کن و با «چپتر بعدی» ادامه بده. هر جا گیر کردی، دکمه‌ی کتاب پایین صفحه تو رو به صفحه‌ی اثر برمی‌گردونه.",
  },
];

export function ReaderGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <GuideSheet open={open} steps={STEPS} onClose={onClose} finishLabel="بزن بریم" />;
}