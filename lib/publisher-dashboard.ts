import "server-only";
import type { ChapterStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { microToUsdt } from "./units";

export interface DashboardChapter {
  id: string;
  chapterNumber: number;
  status: ChapterStatus;
  createdAt: Date;
  comic: { id: string; title: string };
}

export interface DashboardComment {
  id: string;
  content: string;
  createdAt: Date;
  chapterId: string;
  chapterNumber: number;
  comicTitle: string;
  authorName: string;
}

export interface PublisherDashboardData {
  publishedChapters: number;
  pendingChapters: number;
  draftChapters: number;
  needsChangesComics: number;
  pendingComics: number;
  monthRevenueUsdt: number;
  outstandingUsdt: number;
  awaitingConfirmation: number;
  recentChapters: DashboardChapter[];
  recentComments: DashboardComment[];
}

export async function getPublisherDashboard(publisherId: string): Promise<PublisherDashboardData> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    publishedChapters,
    pendingChapters,
    draftChapters,
    comicGroups,
    revenue,
    lines,
    recentChapters,
    recentComments,
  ] = await Promise.all([
    prisma.chapter.count({ where: { status: "PUBLISHED", edition: { publisherId } } }),
    prisma.chapter.count({ where: { status: "PENDING_APPROVAL", edition: { publisherId } } }),
    prisma.chapter.count({ where: { status: { in: ["DRAFT", "SCHEDULED"] }, edition: { publisherId } } }),
    prisma.comic.groupBy({
      by: ["approvalStatus"],
      where: { license: { publisherId }, approvalStatus: { not: "APPROVED" } },
      _count: { _all: true },
    }),
    prisma.revenueAllocation.aggregate({
      where: { beneficiaryType: "PUBLISHER", beneficiaryId: publisherId, createdAt: { gte: monthStart } },
      _sum: { usdtMicro: true },
    }),
    prisma.settlementLine.findMany({
      where: {
        beneficiaryType: "PUBLISHER",
        beneficiaryId: publisherId,
        period: { status: "LOCKED" },
        status: { not: "CANCELLED" },
      },
      select: {
        owedMicro: true,
        paidMicro: true,
        payouts: { select: { confirmation: { select: { status: true } } } },
      },
    }),
    prisma.chapter.findMany({
      where: { edition: { publisherId } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        chapterNumber: true,
        status: true,
        createdAt: true,
        comic: { select: { id: true, title: true } },
      },
    }),
    prisma.comment.findMany({
      where: { parentId: null, status: "APPROVED", chapter: { edition: { publisherId } } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        content: true,
        createdAt: true,
        chapterId: true,
        user: { select: { firstName: true, username: true } },
        chapter: { select: { chapterNumber: true, comic: { select: { title: true } } } },
      },
    }),
  ]);

  let outstandingMicro = 0;
  let awaitingConfirmation = 0;
  for (const line of lines) {
    outstandingMicro += Number(line.owedMicro) - Number(line.paidMicro);
    for (const payout of line.payouts) {
      if (!payout.confirmation) awaitingConfirmation += 1;
    }
  }

  const groupCount = (status: "PENDING_APPROVAL" | "NEEDS_CHANGES") =>
    comicGroups.find((group) => group.approvalStatus === status)?._count._all ?? 0;

  return {
    publishedChapters,
    pendingChapters,
    draftChapters,
    needsChangesComics: groupCount("NEEDS_CHANGES"),
    pendingComics: groupCount("PENDING_APPROVAL"),
    monthRevenueUsdt: microToUsdt(revenue._sum.usdtMicro ?? 0),
    outstandingUsdt: microToUsdt(outstandingMicro),
    awaitingConfirmation,
    recentChapters,
    recentComments: recentComments.map((comment) => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      chapterId: comment.chapterId,
      chapterNumber: comment.chapter.chapterNumber,
      comicTitle: comment.chapter.comic.title,
      authorName: comment.user.username ? `@${comment.user.username}` : comment.user.firstName,
    })),
  };
}