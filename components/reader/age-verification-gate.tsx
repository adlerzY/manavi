import Link from "next/link";
import { BackButton } from "@/components/navigation/back-button";
import { Mascot } from "@/components/ui/mascot";
import { getTelegramLinks } from "@/lib/site-config";

export function AgeVerificationGate({ isAuthenticated }: { isAuthenticated: boolean }) {
  const links = getTelegramLinks();

  return (
    <div
      style={{ paddingTop: "var(--tg-content-safe-area-top, 0px)" }}
      className="relative flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center"
    >
      <div className="absolute right-3" style={{ top: "calc(var(--tg-content-safe-area-top, 0px) + 0.75rem)" }}>
        <BackButton fallbackHref="/app" variant="plain" />
      </div>

      <Mascot pose="point" size={150} float />

      <p className="text-lg font-medium text-text-main">این محتوا مخصوص بزرگسالان است</p>
      <p className="max-w-sm text-sm leading-7 text-text-muted">
        {isAuthenticated
          ? "برای مشاهدهٔ این چپتر باید از صفحهٔ پروفایل، تاییدیهٔ سنی (۱۸+) را فعال کنید."
          : "برای مشاهدهٔ این چپتر ابتدا باید ماناوی را از داخل تلگرام باز کنید تا وارد حساب خود شوید."}
      </p>

      {isAuthenticated ? (
        <Link
          href="/app/profile"
          className="w-full max-w-xs rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
        >
          رفتن به تنظیمات پروفایل
        </Link>
      ) : (
        links && (
          <a
            href={links.webLink}
            rel="noreferrer"
            className="w-full max-w-xs rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
          >
            باز کردن ماناوی در تلگرام
          </a>
        )
      )}

      <Link href="/app" className="w-full max-w-xs rounded-xl border border-border px-6 py-3 text-sm text-text-main">
        بازگشت به خانه
      </Link>
    </div>
  );
}