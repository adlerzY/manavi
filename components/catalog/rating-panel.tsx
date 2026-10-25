"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { rateEdition, rateWork } from "@/app/actions/ratings";

interface RatingState {
  average: number;
  count: number;
  mine: number | null;
}

interface RatingPanelProps {
  workId: string;
  editionId: string;
  authenticated: boolean;
  work: RatingState;
  edition: RatingState;
  canRateWork: boolean;
  canRateEdition: boolean;
  requiredEditionReads: number;
}

function Stars({ value, disabled, onSelect }: { value: number; disabled: boolean; onSelect: (score: number) => void }) {
  return (
    <div className="flex items-center gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(score)}
          aria-label={`${score} ستاره`}
          className="p-0.5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Star size={20} className={score <= value ? "text-accent" : "text-border"} fill={score <= value ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}

export function RatingPanel({
  workId,
  editionId,
  authenticated,
  work: initialWork,
  edition: initialEdition,
  canRateWork,
  canRateEdition,
  requiredEditionReads,
}: RatingPanelProps) {
  const [work, setWork] = useState(initialWork);
  const [edition, setEdition] = useState(initialEdition);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submitWork(score: number) {
    setError(null);
    startTransition(async () => {
      const result = await rateWork(workId, score);
      if (result.success && result.data) {
        setWork({ average: result.data.average, count: result.data.count, mine: result.data.myScore });
      } else {
        setError(result.error ?? "خطا در ثبت امتیاز");
      }
    });
  }

  function submitEdition(score: number) {
    setError(null);
    startTransition(async () => {
      const result = await rateEdition(editionId, score);
      if (result.success && result.data) {
        setEdition({ average: result.data.average, count: result.data.count, mine: result.data.myScore });
      } else {
        setError(result.error ?? "خطا در ثبت امتیاز");
      }
    });
  }

  function summary(state: RatingState): string {
    if (state.count === 0) return "هنوز امتیازی ثبت نشده";
    return `${state.average.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} از ۵ (${state.count.toLocaleString("fa-IR")} رأی)`;
  }

  return (
    <div className="space-y-4 rounded-md border border-border bg-surface p-4">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-text-main">امتیاز داستان و اثر</p>
          <p className="text-xs text-text-muted">{summary(work)}</p>
        </div>
        <Stars value={work.mine ?? 0} disabled={!authenticated || !canRateWork || isPending} onSelect={submitWork} />
        {!authenticated && <p className="text-xs text-text-muted">برای امتیازدهی از داخل تلگرام وارد شوید.</p>}
        {authenticated && !canRateWork && <p className="text-xs text-text-muted">برای امتیازدهی به اثر ابتدا یک چپتر بخوانید.</p>}
      </div>

      <div className="space-y-1 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-text-main">امتیاز کیفیت این ترجمه / نسخه</p>
          <p className="text-xs text-text-muted">{summary(edition)}</p>
        </div>
        <Stars value={edition.mine ?? 0} disabled={!authenticated || !canRateEdition || isPending} onSelect={submitEdition} />
        {authenticated && !canRateEdition && (
          <p className="text-xs text-text-muted">
            برای امتیاز به این نسخه باید حداقل {requiredEditionReads.toLocaleString("fa-IR")} چپتر از آن را خوانده باشید.
          </p>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}