import Link from "next/link";
import type { ReactNode } from "react";

interface ProfileIconLinkProps {
  href: string;
  icon: ReactNode;
  label: string;
}

export function ProfileIconLink({ href, icon, label }: ProfileIconLinkProps) {
  return (
    <Link
      href={href}
      className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-1 py-2.5 active:bg-background"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span>
      <span className="text-[11px] text-text-main">{label}</span>
    </Link>
  );
}