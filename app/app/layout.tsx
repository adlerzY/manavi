import type { ReactNode } from "react";
import { TelegramAuthProvider } from "@/components/providers/telegram-auth-provider";
import { TelegramWebAppScript } from "@/components/telegram-web-app-script";

export default function MiniAppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TelegramWebAppScript />
      <TelegramAuthProvider>{children}</TelegramAuthProvider>
    </>
  );
}