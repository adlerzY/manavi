
import type { ReactNode } from "react";
import { SystemMessageProvider } from "@/components/ui/system-message";
import { SafeAreaBootScript } from "@/components/providers/safe-area-boot-script";
import { TelegramAuthProvider } from "@/components/providers/telegram-auth-provider";

export default function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <SystemMessageProvider>
      <SafeAreaBootScript />
      <TelegramAuthProvider>
        {children}
      </TelegramAuthProvider>
    </SystemMessageProvider>
  );
}
