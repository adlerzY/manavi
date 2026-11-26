
import type { ReactNode } from "react";
import { SystemMessageProvider } from "@/components/ui/system-message";
import { SafeAreaBootScript } from "@/components/providers/safe-area-boot-script";

export default function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <SystemMessageProvider>
      <SafeAreaBootScript />
      {children}
    </SystemMessageProvider>
  );
}
