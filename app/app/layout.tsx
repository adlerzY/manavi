import type { ReactNode } from "react";
import { SystemMessageProvider } from "@/components/ui/system-message";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <SystemMessageProvider>{children}</SystemMessageProvider>;
}
