import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

interface ProfileMenuLinkProps {
  href: string;
  icon: ReactNode;
  title: string;
  meta?: string;
  highlight?: boolean;
}

export function ProfileMenuLink({ href, icon, title, meta, highlight = false }: ProfileMenuLinkProps) {
  return (
    <Link href={href} className="flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-background">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-text-main">{title}</span>
      {meta && (
        <span
          className={`flex-shrink-0 text-xs ${
            highlight ? "rounded-full bg-accent px-2 py-0.5 text-accent-foreground" : "text-text-muted"
          }`}
        >
          {meta}
        </span>
      )}
      <ChevronLeft size={16} className="flex-shrink-0 text-text-muted" />
    </Link>
  );
}