import Link from "next/link";

export interface PageTab {
  id: string;
  label: string;
  href: string;
}

export function PageTabs({ tabs, active }: { tabs: PageTab[]; active: string }) {
  return (
    <nav className="flex overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            replace
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={`relative flex min-h-11 flex-shrink-0 items-center px-4 text-sm ${
              isActive ? "font-medium text-primary" : "text-text-muted"
            }`}
          >
            {tab.label}
            {isActive && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />}
          </Link>
        );
      })}
    </nav>
  );
}