"use client";

import type { ReactNode } from "react";
import { TonConnectUIProvider, THEME } from "@tonconnect/ui-react";

const MANIFEST_URL = `${process.env.NEXT_PUBLIC_MINI_APP_URL ?? ""}/tonconnect-manifest.json`;

export function TonConnectProvider({ children }: { children: ReactNode }) {
  return (
    <TonConnectUIProvider manifestUrl={MANIFEST_URL} uiPreferences={{ theme: THEME.DARK }}>
      {children}
    </TonConnectUIProvider>
  );
}