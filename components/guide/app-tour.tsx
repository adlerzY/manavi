"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { GuideSheet, type GuideStep } from "./guide-sheet";
import { GUIDE_EVENT, hasSeenGuide, markGuideSeen, type GuideId } from "@/lib/guide";

const STEPS: GuideStep[] = [
  {
    pose: "wave",
    title: "به ماناوی خوش اومدی",
    text: "مانهوا، مانگا و وبتون فارسی، مستقیم داخل تلگرام. یه تور کوتاه تا همه‌چیز دم دستت باشه.",
  },
  {
    pose: "thinking",
    title: "پیدا کردن اثر",
    text: "از تب «جستجو» پایین صفحه اسم اثر رو بزن یا با فیلتر ژانر، وضعیت و نوع دسترسی دنبالش بگرد.",
  },
  {
    pose: "celebrate",
    title: "آثار تمام رایگان",
    text: "اثرهایی که همه‌ی چپترهاشون رایگانه با برچسب سبز «رایگان» بالای صفحه‌ی اصلی هستن؛ بدون خرج سکه بخون.",
  },
  {
    pose: "reading",
    title: "کتابخانه و بوکمارک",
    text: "اثر رو بوکمارک کن تا با اعلان چپتر جدید باخبر بشی. جای خوندنت هم خودکار ذخیره می‌شه و از کتابخانه ادامه‌ش می‌دی.",
  },
  {
    pose: "coin",
    title: "سکه و حمایت",
    text: "چپترهای سکه‌ای رو با سکه باز کن و از مترجم‌ها و ناشرها مستقیم حمایت کن. سکه نداشتی هم نگران نباش، همیشه آثار رایگان هست.",
  },
  {
    pose: "point",
    title: "گیر کردی؟",
    text: "هر موقع خواستی از «پروفایل» دکمه‌ی «راهنما» رو بزن تا این تور دوباره پخش بشه. بالای هر صفحه هم دکمه‌ی بازگشت هست.",
  },
];

export function AppTour() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pathname !== "/app" || hasSeenGuide("app-tour")) return;
    const timer = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    function handleOpen(event: Event) {
      if ((event as CustomEvent<GuideId>).detail === "app-tour") setOpen(true);
    }
    window.addEventListener(GUIDE_EVENT, handleOpen);
    return () => window.removeEventListener(GUIDE_EVENT, handleOpen);
  }, []);

  function handleClose() {
    markGuideSeen("app-tour");
    setOpen(false);
  }

  return <GuideSheet open={open} steps={STEPS} onClose={handleClose} finishLabel="بزن بریم" />;
}