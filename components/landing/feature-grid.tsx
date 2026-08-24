import { Layers, ShieldCheck, HeartHandshake, BellRing } from "lucide-react";
import { FeatureSpotlightCard } from "./feature-spotlight-card";
import { HalftoneOverlay } from "./halftone-overlay";

const FEATURES = [
  {
    icon: <Layers size={20} />,
    title: "ریدر ساخته‌شده برای اسکرول",
    description: "سه حالت خواندن عمودی، افقی و دو‌صفحه‌ای، با اسکرول خودکار و بارگذاری پیش‌بین صفحات بعدی.",
  },
  {
    icon: <ShieldCheck size={20} />,
    title: "بدون تبلیغ مزاحم",
    description: "چپترهای سکه‌ای کاملاً بدون تبلیغ باز می‌شن. چپترهای رایگان فقط با یک تبلیغ کوتاه و قابل رد کردن در پایان همراهن — بدون پاپ‌آپ یا بنر وسط خوندن.",
  },
  {
    icon: <HeartHandshake size={20} />,
    title: "حمایت مستقیم از تیم‌ها",
    description: "دونیت مستقیم به مترجم‌ها و طراح‌ها، بدون واسطه و با پورسانت شفاف برای هر ناشر.",
  },
  {
    icon: <BellRing size={20} />,
    title: "خبر چپتر تازه، همون لحظه",
    description: "با بوکمارک کردن هر عنوان، به‌محض انتشار چپتر جدید، توی تلگرامت پیام می‌گیری.",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="relative mx-auto max-w-6xl px-4 py-20">
      <HalftoneOverlay opacity={0.04} gap={20} />
      <div className="relative mb-12 text-center">
        <span className="text-xs font-medium tracking-widest text-primary">چرا مانوی</span>
        <h2 className="mt-3 text-2xl font-bold text-text-main sm:text-3xl">
          هرچی برای غرق‌شدن توی داستان لازم داری
        </h2>
      </div>
      <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => (
          <FeatureSpotlightCard key={feature.title} {...feature} />
        ))}
      </div>
    </section>
  );
}