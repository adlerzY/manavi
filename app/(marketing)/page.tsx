import type { Metadata } from "next";
import { getSiteStats } from "@/lib/site-stats";
import { getTelegramLinks } from "@/lib/site-config";
import { LandingPage } from "@/components/landing/landing-page";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "مناوی — پلتفرم خوانش مانهوا و مانگا در تلگرام",
  description:
    "مناوی، پلتفرم خوانش آنلاین مانهوا، مانگا و وبتون به‌صورت مینی‌اپ تلگرام. بدون نصب جداگانه، با حمایت مستقیم از مترجمان و طراحان.",
};

export default async function HomePage() {
  const stats = await getSiteStats();
  const links = getTelegramLinks();

  return <LandingPage stats={stats} links={links} />;
}