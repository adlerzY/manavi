import Link from "next/link";
import type { ReactNode } from "react";
import { Mascot, type MascotPose } from "./mascot";

export interface EmptyStateAction {
  href: string;
  label: string;
  variant?: "primary" | "ghost";
  external?: boolean;
}

interface EmptyStateProps {
  pose: MascotPose;
  title: string;
  description?: string;
  actions?: EmptyStateAction[];
  compact?: boolean;
  children?: ReactNode;
}

const PRIMARY_CLASS =
  "flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground";
const GHOST_CLASS =
  "flex min-h-11 items-center justify-center rounded-xl border border-border px-5 py-2.5 text-sm text-text-main";

export function EmptyState({ pose, title, description, actions = [], compact = false, children }: EmptyStateProps) {
  const hasFooter = Boolean(children) || actions.length > 0;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border bg-surface/60 text-center ${
        compact ? "px-5 py-6" : "px-6 py-8"
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40"
        style={{ backgroundImage: "radial-gradient(ellipse at top, rgba(0,220,100,0.16), transparent 70%)" }}
      />
      <div className="relative flex justify-center">
        <Mascot pose={pose} size={compact ? 112 : 150} float />
      </div>
      <h2 className="relative mt-3 text-base font-semibold text-text-main">{title}</h2>
      {description && (
        <p className="relative mx-auto mt-2 max-w-xs text-sm leading-7 text-text-muted">{description}</p>
      )}
      {hasFooter && (
        <div className="relative mt-5 flex flex-col gap-2">
          {children}
          {actions.map((action, index) => {
            const variant = action.variant ?? (index === 0 && !children ? "primary" : "ghost");
            const className = variant === "primary" ? PRIMARY_CLASS : GHOST_CLASS;
            return action.external ? (
              <a key={`${action.href}-${action.label}`} href={action.href} rel="noreferrer" className={className}>
                {action.label}
              </a>
            ) : (
              <Link key={`${action.href}-${action.label}`} href={action.href} className={className}>
                {action.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}