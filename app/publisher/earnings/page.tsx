import { getMyEarnings } from "@/app/actions/payouts";
import { EarningsPanel } from "@/components/earnings/earnings-panel";

export default async function PublisherEarningsPage() {
  const overview = await getMyEarnings();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text-main">درآمد و تسویه‌حساب</h1>
      {overview ? (
        <EarningsPanel overview={overview} />
      ) : (
        <p className="text-sm text-text-muted">برای مشاهده‌ی درآمد باید وارد شوید.</p>
      )}
    </div>
  );
}