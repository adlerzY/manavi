"use client";

import { useEffect, useState } from "react";
import { Hand, ArrowLeftRight, Layers } from "lucide-react";

const STORAGE_KEY = "manavi-reader-guide-v1";

const TIPS = [
  {
    icon: <Hand size={22} />,
    title: "نمایش کنترل‌ها",
    text: "با یک ضربه روی وسط صفحه، نوار بالا و پایین نمایش داده یا پنهان می‌شود.",
  },
  {
    icon: <ArrowLeftRight size={22} />,
    title: "ورق زدن",
    text: "در حالت افقی و دوصفحه‌ای، با کشیدن انگشت یا لمس کنار صفحه ورق بزن. در حالت عمودی فقط اسکرول کن.",
  },
  {
    icon: <Layers size={22} />,
    title: "تغییر حالت مطالعه",
    text: "از دکمه‌های بالای صفحه می‌توانی بین حالت عمودی، افقی و دوصفحه‌ای جابه‌جا شوی.",
  },
];

export function ReaderGuide() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {}
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 px-6">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-white/10 bg-neutral-900 p-6">
        <h2 className="text-center text-base font-semibold text-white">راهنمای سریع ریدر</h2>
        <div className="space-y-4">
          {TIPS.map((tip) => (
            <div key={tip.title} className="flex items-start gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                {tip.icon}
              </div>
              <div>
                <p className="text-sm font-medium text-white">{tip.title}</p>
                <p className="mt-1 text-sm leading-7 text-white/60">{tip.text}</p>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
        >
          متوجه شدم
        </button>
      </div>
    </div>
  );
}