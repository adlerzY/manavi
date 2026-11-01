import "server-only";
import type { ChapterStatus } from "@prisma/client";
import { prisma } from "./prisma";

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
  monthRevenueCoins: number;
  availableCoins: number;
  heldCoins: number;
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
    account,
    held,
    awaitingConfirmation,
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
      _sum: { allocatedUnits: true },
    }),
    prisma.earningsAccount.findUnique({
      where: { ownerType_ownerId: { ownerType: "PUBLISHER", ownerId: publisherId } },
      select: { balanceUnits: true },
    }),
    prisma.withdrawalRequest.aggregate({
      where: { ownerType: "PUBLISHER", ownerId: publisherId, status: { in: ["PENDING", "PROCESSING"] } },
      _sum: { amountUnits: true },
    }),
    prisma.withdrawalRequest.count({
      where: { ownerType: "PUBLISHER", ownerId: publisherId, status: "PAID", response: null },
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

  const groupCount = (status: "PENDING_APPROVAL" | "NEEDS_CHANGES") =>
    comicGroups.find((group) => group.approvalStatus === status)?._count._all ?? 0;

  return {
    publishedChapters,
    pendingChapters,
    draftChapters,
    needsChangesComics: groupCount("NEEDS_CHANGES"),
    pendingComics: groupCount("PENDING_APPROVAL"),
    monthRevenueCoins: (revenue._sum.allocatedUnits ?? 0) / 100,
    availableCoins: Number(account?.balanceUnits ?? 0n) / 100,
    heldCoins: Number(held._sum.amountUnits ?? 0n) / 100,
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