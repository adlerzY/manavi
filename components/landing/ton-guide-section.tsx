import Link from "next/link";
import { Wallet, ArrowLeftRight, CreditCard, CheckCircle2 } from "lucide-react";

const STEPS = [
  {
    icon: <Wallet size={18} />,
    title: "نصب کیف پول",
    description: "یک کیف پول سازگار با TON Connect مثل Tonkeeper نصب کن.",
  },
  {
    icon: <ArrowLeftRight size={18} />,
    title: "اتصال کیف پول",
    description: "از صفحه فروشگاه ماناوی، کیف پولت رو با یک ضربه به اپ وصل کن.",
  },
  {
    icon: <CreditCard size={18} />,
    title: "انتخاب پکیج سکه",
    description: "پکیج سکه‌ای که می‌خوای — یا مقدار دلخواه — رو انتخاب و تایید کن.",
  },
  {
    icon: <CheckCircle2 size={18} />,
    title: "تایید خودکار تراکنش",
    description: "بعد از تایید در کیف پول، حساب تو خودکار و در چند لحظه شارژ می‌شه.",
  },
];

export function TonGuideSection() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 py-20">
      <div className="mb-10 text-center">
        <span className="text-xs font-medium tracking-widest text-primary">پرداخت ارزی</span>
        <h2 className="mt-3 text-2xl font-bold text-text-main sm:text-3xl">خرید سکه با تتر</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-8 text-text-muted">
          پرداخت مستقیم و بدون واسطه با تتر از طریق کیف پول، بدون نیاز به کارت بانکی یا درگاه واسط.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <div key={step.title} className="relative rounded-2xl border border-border bg-surface/50 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {step.icon}
            </div>
            <span className="absolute left-5 top-5 text-xs font-medium text-text-muted">
              {(index + 1).toLocaleString("fa-IR")}
            </span>
            <h3 className="mt-4 text-sm font-semibold text-text-main">{step.title}</h3>
            <p className="mt-2 text-xs leading-6 text-text-muted">{step.description}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <Link
          href="/buy-with-ton"
          className="rounded-full border border-primary/30 bg-primary/10 px-6 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
        >
          مشاهده راهنمای کامل خرید با تتر
        </Link>
      </div>
    </section>
  );
}