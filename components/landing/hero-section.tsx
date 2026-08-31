import Image from "next/image";
import { GlowOrbs } from "./glow-orbs";
import { HalftoneOverlay } from "./halftone-overlay";
import { AnimatedHeadline } from "./animated-headline";
import { FloatingPanelCard } from "./floating-panel-card";
import { HeroIconGlow } from "./hero-icon-glow";
import { TelegramCta } from "@/components/landing/telegram-cta";
import { GlowCtaButton } from "./glow-cta-button";
import type { TelegramLinks } from "@/lib/site-config";

interface HeroSectionProps {
  links: TelegramLinks | null;
}

export function HeroSection({ links }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden pb-20 pt-6 sm:pt-10">
      <div className="absolute inset-0 -z-10 bg-background" />
      <GlowOrbs />
      <HalftoneOverlay opacity={0.05} gap={18} />

      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 px-4 md:grid-cols-2 md:gap-8">
        <div className="flex flex-col items-center text-center md:items-start md:text-right">
          <div className="relative mb-8 h-16 w-16">
            <HeroIconGlow />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-surface/60 backdrop-blur-sm">
              <Image src="/favicon.svg" alt="ماناوی" width={40} height={40} sizes="40px" className="rounded-lg" priority />
            </div>
          </div>

          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
            بدون نصب، مستقیم داخل تلگرام
          </span>

          <AnimatedHeadline
            text="هر اسکرول یک فصل تازه"
            className="max-w-xl text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-5xl lg:text-6xl"
            gradientClassName="bg-gradient-to-l from-primary to-accent bg-clip-text text-transparent"
          />

          <p className="mt-6 max-w-md text-sm leading-8 text-text-muted sm:text-base">
            ماناوی صدها مانهوا، مانگا و وبتون فارسی‌شده رو مستقیم داخل تلگرام در اختیارت می‌ذاره؛
            با ریدر اختصاصی برای اسکرول بی‌وقفه، بدون تبلیغ مزاحم و با حمایت مستقیم از مترجم‌ها و طراح‌ها.
          </p>

          <div className="mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
            {links ? (
              <div className="relative">
                <div className="absolute -inset-1 animate-pulse rounded-xl bg-gradient-to-l from-primary/40 via-accent/30 to-primary/40 blur-md" />
                <div className="relative">
                  <TelegramCta webLink={links.webLink} nativeLink={links.nativeLink} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-accent">لینک مینی‌اپ هنوز در تنظیمات محیطی ست نشده است.</p>
            )}

            <GlowCtaButton href={links?.webLink ?? "/app"} nativeHref={links?.nativeLink} variant="secondary">
              کاوش در دنیای ماناوی
            </GlowCtaButton>
          </div>
        </div>

        <div className="relative mx-auto h-[380px] w-full max-w-sm sm:h-[460px] sm:max-w-md" style={{ perspective: 1200 }}>
          <FloatingPanelCard
            label="مانهوا"
            sublabel="عرش شکسته"
            imageSrc="/images/hero/cover-1.jpg"
            fromColor="#0f2f1f"
            toColor="#00DC64"
            rotate={-8}
            tiltX={10}
            tiltY={-16}
            floatDelay={0}
            floatDuration={7}
            className="left-[4%] top-[6%] z-30"
            priority
          />
          <FloatingPanelCard
            label="وبتون"
            sublabel="سایه‌های شهر"
            imageSrc="/images/hero/cover-2.jpg"
            fromColor="#2b0f22"
            toColor="#EC4899"
            rotate={6}
            tiltX={-8}
            tiltY={14}
            floatDelay={0.6}
            floatDuration={8}
            className="left-[34%] top-[26%] z-20"
          />
          <FloatingPanelCard
            label="مانگا"
            sublabel="طوفان بی‌پایان"
            imageSrc="/images/hero/cover-3.jpg"
            fromColor="#111827"
            toColor="#22c55e"
            rotate={-3}
            tiltX={6}
            tiltY={-8}
            floatDelay={1.1}
            floatDuration={9}
            className="left-[16%] top-[46%] z-10 hidden sm:block"
          />
        </div>
      </div>
    </section>
  );
}