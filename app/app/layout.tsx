import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SafeAreaBootScript } from "@/components/providers/safe-area-boot-script";

const vazirFont = localFont({
  src: "./fonts/Vazirmatn-Medium.woff2",
  variable: "--font-vazir",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#121212",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  title: "ماناوی — پلتفرم خوانش مانهوا و مانگا",
  description: "پلتفرم خوانش آنلاین مانهوا، مانگا و وبتون در تلگرام",
  applicationName: "ماناوی",
  appleWebApp: {
    capable: true,
    title: "ماناوی",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className={vazirFont.variable}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <SafeAreaBootScript />
      </head>
      <body className="font-sans bg-background text-text-main antialiased">{children}</body>
    </html>
  );
}