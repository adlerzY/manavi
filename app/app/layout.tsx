import type { ReactNode } from "react";
import type { Viewport } from "next";
import { TelegramAuthProvider } from "@/components/providers/telegram-auth-provider";
import { NativeAppShell } from "@/components/providers/native-app-shell";
import { TelegramWebAppScript } from "@/components/telegram-web-app-script";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function MiniAppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TelegramWebAppScript />
      <NativeAppShell />
      <TelegramAuthProvider>{children}</TelegramAuthProvider>
    </>
  );
}