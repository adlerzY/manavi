import type { ProfileLink } from "@/lib/profile-links";

export function ProfileLinkChips({ links }: { links: ProfileLink[] }) {
  if (links.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <a
          key={`${link.label}-${link.url}`}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-border px-3 py-1.5 text-xs text-text-main hover:border-primary"
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}