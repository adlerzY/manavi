import { getTelegramLinks } from "@/lib/site-config";
import { TelegramLoginButton } from "@/components/auth/telegram-login-button";
import { EmptyState, type EmptyStateAction } from "./empty-state";

export function TelegramOnlyNotice({ message }: { message: string }) {
  const links = getTelegramLinks();

  const actions: EmptyStateAction[] = [
    ...(links ? [{ href: links.webLink, label: "باز کردن ماناوی در تلگرام", external: true, variant: "ghost" as const }] : []),
    { href: "/app", label: "رفتن به خانه", variant: "ghost" },
  ];

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <EmptyState pose="point" title="برای ادامه وارد شو" description={message} actions={actions}>
          <TelegramLoginButton />
        </EmptyState>
      </div>
    </main>
  );
}