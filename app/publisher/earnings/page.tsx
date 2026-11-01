import { getSessionUser } from "@/lib/auth";
import { loadEarningsOverview } from "@/lib/withdrawals";
import { EarningsPanel } from "@/components/earnings/earnings-panel";

export default async function PublisherEarningsPage() {
  const user = await getSessionUser();
  if (!user) {
    return <p className="text-sm text-text-muted">برای مشاهده‌ی درآمد باید وارد شوید.</p>;
  }

  const overview = await loadEarningsOverview(user);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-text-main">درآمد و تسویه‌حساب</h1>
      <EarningsPanel overview={overview} />
    </div>
  );
}