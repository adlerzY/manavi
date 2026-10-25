import { getSessionUser } from "@/lib/auth";
import { getMyEarnings } from "@/app/actions/payouts";
import { EarningsPanel } from "@/components/earnings/earnings-panel";
import { BackButton } from "@/components/navigation/back-button";

export default async function EarningsPage() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <p className="text-sm text-text-muted">برای مشاهده‌ی درآمد، این صفحه را از داخل تلگرام باز کنید.</p>
      </main>
    );
  }

  const overview = await getMyEarnings();

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <BackButton fallbackHref="/app/profile" variant="plain" />
          <h1 className="text-lg font-semibold text-text-main">درآمد و تسویه‌حساب</h1>
        </div>
        {overview && <EarningsPanel overview={overview} />}
      </div>
    </main>
  );
}