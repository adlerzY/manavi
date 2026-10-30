"use client";

import { useState } from "react";
import { ChevronLeft, Gift } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Mascot } from "@/components/ui/mascot";
import { ReferralCard } from "@/components/gamification/referral-card";

interface ReferralSheetProps {
  referralLink: string | null;
  referralCode: string;
  referralCount: number;
  rewardCoins: number;
}

export function ReferralSheet({ referralLink, referralCode, referralCount, rewardCoins }: ReferralSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-14 w-full flex-shrink-0 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-right"
      >
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Gift size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-text-main">دعوت دوستان</span>
          <span className="mt-0.5 block text-xs text-text-muted">
            {referralCount.toLocaleString("fa-IR")} دعوت موفق
          </span>
        </span>
        <ChevronLeft size={18} className="flex-shrink-0 text-text-muted" />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="دعوت دوستان">
        <div className="flex justify-center">
          <Mascot pose="gift" size={120} float />
        </div>
        <ReferralCard
          referralLink={referralLink}
          referralCode={referralCode}
          referralCount={referralCount}
          rewardCoins={rewardCoins}
        />
      </BottomSheet>
    </>
  );
}