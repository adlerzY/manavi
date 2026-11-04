import { listGifts } from "@/app/admin/actions/gifts";
import { GiftManager } from "@/components/admin/gift-manager";

export default async function AdminGiftsPage() {
  const gifts = await listGifts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-main">هدیه‌ی دسترسی</h1>
        <p className="mt-1 text-sm leading-7 text-text-muted">
          دسترسی به چپترهای سکه‌ای را بدون ثبت تراکنش فروش به کاربران یا گروهی از آن‌ها هدیه بدهید. منبع، دلیل و مخاطبان هر هدیه ثبت می‌شود و هدیه قابل لغو است.
        </p>
      </div>
      <GiftManager initialGifts={gifts} />
    </div>
  );
}