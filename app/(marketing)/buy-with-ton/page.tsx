import type { Metadata } from "next";
import { Wallet, ArrowLeftRight, CreditCard, CheckCircle2, ShieldCheck, HelpCircle } from "lucide-react";
import { LandingHeader } from "@/components/landing/landing-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { GlowCtaButton } from "@/components/landing/glow-cta-button";
import { getTelegramLinks } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "راهنمای خرید سکه با تتر — ماناوی",
  description: "آموزش گام‌به‌گام اتصال کیف پول و خرید سکه با تتر در ماناوی.",
};

const STEPS = [
  {
    icon: <Wallet size={20} />,
    title: "۱. نصب کیف پول",
    description:
      "اگر هنوز کیف پول نداری، اپلیکیشن Tonkeeper یا هر کیف پول دیگه‌ای که از TON Connect پشتیبانی می‌کنه رو از استور گوشیت نصب کن و یک حساب بساز.",
  },
  {
    icon: <ArrowLeftRight size={20} />,
    title: "۲. اتصال کیف پول به ماناوی",
    description:
      "داخل مینی‌اپ ماناوی به بخش «فروشگاه» برو. روی دکمه اتصال کیف پول بزن و کیف پولت رو از لیست انتخاب کن؛ تایید اتصال داخل خود اپ کیف پول انجام می‌شه.",
  },
  {
    icon: <CreditCard size={20} />,
    title: "۳. انتخاب پکیج سکه",
    description:
      "از فروشگاه، پکیج سکه‌ای که می‌خوای — یا هر مقدار دلخواهی که خودت مشخص می‌کنی — رو انتخاب کن. مبلغ به تتر بر اساس نرخ لحظه‌ای نمایش داده می‌شه.",
  },
  {
    icon: <CheckCircle2 size={20} />,
    title: "۴. تایید تراکنش در کیف پول",
    description:
      "بعد از زدن دکمه پرداخت، اپ کیف پولت باز می‌شه و جزئیات تراکنش رو نشون می‌ده. تراکنش رو تایید کن — تا وقتی روی شبکه تایید بشه چند لحظه صبر کن.",
  },
  {
    icon: <ShieldCheck size={20} />,
    title: "۵. فعال‌سازی خودکار",
    description:
      "به محض تایید تراکنش روی بلاک‌چین، سکه‌های خریداری‌شده بدون هیچ کار اضافه‌ای مستقیم به حساب ماناوی‌ت اضافه می‌شه.",
  },
];

export default function BuyWithTetherPage() {
  const links = getTelegramLinks();

  return (
    <main className="relative min-h-screen bg-background text-text-main">
      <LandingHeader />

      <section className="mx-auto max-w-3xl px-4 pb-10 pt-6 text-center sm:pt-10">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
          پرداخت ارزی و بدون واسطه
        </span>
        <h1 className="mx-auto mt-5 max-w-xl text-2xl font-bold leading-relaxed text-text-main sm:text-3xl">
          راهنمای خرید سکه با تتر
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-8 text-text-muted">
          ماناوی خرید سکه رو مستقیم از طریق تتر و بدون نیاز به کارت بانکی یا درگاه واسط ممکن کرده. این راهنما مراحل رو قدم‌به‌قدم نشون می‌ده.
        </p>
      </section>

      <section className="mx-auto max-w-3xl space-y-4 px-4 pb-16">
        {STEPS.map((step) => (
          <div key={step.title} className="flex gap-4 rounded-2xl border border-border bg-surface/60 p-5">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {step.icon}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-main">{step.title}</h2>
              <p className="mt-1.5 text-sm leading-7 text-text-muted">{step.description}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-20">
        <div className="rounded-2xl border border-border bg-surface/40 p-6">
          <div className="mb-3 flex items-center gap-2 text-text-main">
            <HelpCircle size={18} className="text-primary" />
            <h2 className="text-sm font-semibold">نکات مهم</h2>
          </div>
          <ul className="space-y-2 text-sm leading-7 text-text-muted">
            <li>قیمت‌ها به تتر بر اساس نرخ لحظه‌ای محاسبه می‌شن و ممکنه با نوسان بازار کمی تغییر کنن.</li>
            <li>تایید تراکنش روی شبکه معمولاً چند ثانیه تا چند دقیقه طول می‌کشه.</li>
            <li>اگر بعد از پرداخت موفق، سکه فعال نشد، چند دقیقه صبر کن و صفحه فروشگاه رو رفرش کن.</li>
            <li>همیشه آدرس کیف پول و مبلغ نمایش‌داده‌شده رو قبل تایید نهایی بررسی کن.</li>
          </ul>
        </div>
      </section>

      {links && (
        <section className="mx-auto max-w-3xl px-4 pb-24 text-center">
          <p className="mb-5 text-sm text-text-muted">آماده‌ای که از داخل تلگرام فروشگاه رو باز کنی؟</p>
          <GlowCtaButton href={links.webLink} nativeHref={links.nativeLink}>
            رفتن به فروشگاه ماناوی
          </GlowCtaButton>
        </section>
      )}

      <SiteFooter />
    </main>
  );
}