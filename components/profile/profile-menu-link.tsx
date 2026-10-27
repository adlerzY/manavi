import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

interface ProfileMenuLinkProps {
  href: string;
  icon: ReactNode;
  title: string;
  subtitle?: string;
}

export function ProfileMenuLink({ href, icon, title, subtitle }: ProfileMenuLinkProps) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 hover:border-primary"
    >
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-text-main">{title}</span>
        {subtitle && <span className="mt-0.5 block text-xs text-text-muted">{subtitle}</span>}
      </span>
      <ChevronLeft size={18} className="flex-shrink-0 text-text-muted" />
    </Link>
  );
}