import { ChevronDown } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { WITHDRAWAL_EVENT_LABELS, type WithdrawalEventView } from "@/lib/withdrawal-types";

export function WithdrawalTimeline({ events }: { events: WithdrawalEventView[] }) {
  if (events.length === 0) return null;

  return (
    <details className="group rounded-md border border-border bg-background">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 text-xs text-text-muted [&::-webkit-details-marker]:hidden">
        تاریخچه‌ی رهگیری ({events.length.toLocaleString("fa-IR")})
        <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
      </summary>
      <ol className="space-y-3 border-t border-border px-3 py-3">
        {events.map((event) => (
          <li key={event.id} className="space-y-0.5 text-xs">
            <p className="text-text-main">
              {WITHDRAWAL_EVENT_LABELS[event.type]}
              {event.actorName && <span className="text-text-muted"> — {event.actorName}</span>}
            </p>
            {event.note && <p className="leading-6 text-text-muted">{event.note}</p>}
            <p className="text-[11px] text-text-muted">{formatDateTime(event.createdAt)}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}