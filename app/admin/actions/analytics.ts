"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { getTomanPerUsdt } from "@/lib/platform-settings";

export interface TopComicStat {
  id: string;
  title: string;
  slug: string;
  viewCount: number;
  bookmarkCount: number;
}

export async function getTopComics(limit = 10): Promise<TopComicStat[]> {
  await requireAdmin();
  const comics = await prisma.comic.findMany({
    orderBy: { viewCount: "desc" },
    take: limit,
    select: { id: true, title: true, slug: true, viewCount: true, _count: { select: { bookmarks: true } } },
  });
  return comics.map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    viewCount: c.viewCount,
    bookmarkCount: c._count.bookmarks,
  }));
}

export interface TopChapterStat {
  id: string;
  chapterNumber: number;
  comicTitle: string;
  viewCount: number;
}

export async function getTopChapters(limit = 10): Promise<TopChapterStat[]> {
  await requireAdmin();
  const chapters = await prisma.chapter.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { viewCount: "desc" },
    take: limit,
    select: { id: true, chapterNumber: true, viewCount: true, comic: { select: { title: true } } },
  });
  return chapters.map((c) => ({
    id: c.id,
    chapterNumber: c.chapterNumber,
    comicTitle: c.comic.title,
    viewCount: c.viewCount,
  }));
}

export interface CoinStats {
  totalRevenueUsdt: number;
  totalRevenueToman: number | null;
  totalCoinsSpent: number;
  purchaseCount: number;
  donationTotalUsdt: number;
  donationTotalToman: number | null;
}

export async function getCoinStats(): Promise<CoinStats> {
  await requireAdmin();
  const [purchases, spends, donations, tomanPerUsdt] = await Promise.all([
    prisma.transaction.aggregate({ where: { type: "COIN_PURCHASE", status: "PAID" }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.transaction.aggregate({ where: { type: "CHAPTER_UNLOCK", status: "PAID" }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { type: "DONATION", status: "PAID" }, _sum: { amount: true } }),
    getTomanPerUsdt(),
  ]);

  const totalRevenueUsdt = Number(purchases._sum.amount ?? 0);
  const donationTotalUsdt = Number(donations._sum.amount ?? 0);

  return {
    totalRevenueUsdt,
    totalRevenueToman: tomanPerUsdt > 0 ? Math.round(totalRevenueUsdt * tomanPerUsdt) : null,
    totalCoinsSpent: Number(spends._sum.amount ?? 0),
    purchaseCount: purchases._count._all,
    donationTotalUsdt,
    donationTotalToman: tomanPerUsdt > 0 ? Math.round(donationTotalUsdt * tomanPerUsdt) : null,
  };
}