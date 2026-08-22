import type { ReactNode } from "react";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const vazirFont = localFont({
  src: "./fonts/Vazirmatn-Medium.woff2",
  variable: "--font-vazir",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ماناوی — پلتفرم خوانش مانهوا و مانگا",
  description: "پلتفرم خوانش آنلاین مانهوا، مانگا و وبتون در تلگرام",
  icons: {
    icon: [
      {
        url: "/favicon.svg",
        type: "image/svg+xml",
      },
    ],
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
      <body className="font-sans bg-background text-text-main antialiased">
        {children}
      </body>
    </html>
  );
}