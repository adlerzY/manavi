import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface DisclosureProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function Disclosure({ title, subtitle, icon, defaultOpen = false, children }: DisclosureProps) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 [&::-webkit-details-marker]:hidden">
        {icon && (
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-text-main">{title}</span>
          {subtitle && <span className="mt-0.5 block text-xs text-text-muted">{subtitle}</span>}
        </span>
        <ChevronDown size={18} className="flex-shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}