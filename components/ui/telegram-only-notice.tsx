import { getTelegramLinks } from "@/lib/site-config";
import { EmptyState, type EmptyStateAction } from "./empty-state";

export function TelegramOnlyNotice({ message }: { message: string }) {
  const links = getTelegramLinks();

  const actions: EmptyStateAction[] = [
    ...(links ? [{ href: links.webLink, label: "باز کردن ماناوی در تلگرام", external: true }] : []),
    { href: "/app", label: "رفتن به خانه", variant: "ghost" },
  ];

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <EmptyState pose="point" title="این بخش مخصوص داخل تلگرامه" description={message} actions={actions} />
      </div>
    </main>
  );
}