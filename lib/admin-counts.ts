import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { PLATFORM_LICENSE_ID, PLATFORM_PUBLISHER_ID } from "@/lib/platform-license";

export interface AdminNavCounts {
  approvals: number;
  pendingChapters: number;
  pendingComics: number;
  pendingComments: number;
  openReports: number;
  moderation: number;
  openWithdrawals: number;
  disputedWithdrawals: number;
  payouts: number;
}

const ZERO_COUNTS: AdminNavCounts = {
  approvals: 0,
  pendingChapters: 0,
  pendingComics: 0,
  pendingComments: 0,
  openReports: 0,
  moderation: 0,
  openWithdrawals: 0,
  disputedWithdrawals: 0,
  payouts: 0,
};

export const getAdminNavCounts = cache(async (): Promise<AdminNavCounts> => {
  try {
    const [pendingChapters, pendingComics, pendingComments, openReports, openWithdrawals, disputedWithdrawals] = await Promise.all([
      prisma.chapter.count({ where: { status: "PENDING_APPROVAL" } }),
      prisma.comic.count({ where: { approvalStatus: "PENDING_APPROVAL" } }),
      prisma.comment.count({ where: { status: "PENDING" } }),
      prisma.contentReport.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
      prisma.withdrawalRequest.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
      prisma.withdrawalRequest.count({ where: { response: "DISPUTED", disputeResolvedAt: null } }),
    ]);

    return {
      approvals: pendingChapters + pendingComics,
      pendingChapters,
      pendingComics,
      pendingComments,
      openReports,
      moderation: pendingChapters + pendingComics + pendingComments + openReports,
      openWithdrawals,
      disputedWithdrawals,
      payouts: openWithdrawals + disputedWithdrawals,
    };
  } catch (err) {
    console.error("[admin-counts] nav counts failed", err);
    return ZERO_COUNTS;
  }
});

export interface AdminDashboardExtras {
  needsChangesComics: number;
  pendingLicenses: number;
  expiringLicenses: number;
  failedTransactions24h: number;
  userCount: number;
  comicCount: number;
  publishedChapters: number;
  publisherCount: number;
  activeLicenses: number;
  outstandingEarningsCoins: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const LICENSE_EXPIRY_WARNING_DAYS = 30;

export const getAdminDashboardExtras = cache(async (): Promise<AdminDashboardExtras> => {
  const now = new Date();
  const soon = new Date(now.getTime() + LICENSE_EXPIRY_WARNING_DAYS * DAY_MS);
  const dayAgo = new Date(now.getTime() - DAY_MS);

  const [
    needsChangesComics,
    pendingLicenses,
    expiringLicenses,
    failedTransactions24h,
    userCount,
    comicCount,
    publishedChapters,
    publisherCount,
    activeLicenses,
    earnings,
  ] = await Promise.all([
    prisma.comic.count({ where: { approvalStatus: "NEEDS_CHANGES" } }),
    prisma.license.count({
      where: { status: "PENDING", terminatedAt: null, id: { not: PLATFORM_LICENSE_ID } },
    }),
    prisma.license.count({
      where: {
        status: "ACTIVE",
        terminatedAt: null,
        id: { not: PLATFORM_LICENSE_ID },
        endDate: { gte: now, lte: soon },
      },
    }),
    prisma.transaction.count({ where: { status: "FAILED", createdAt: { gte: dayAgo } } }),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.comic.count(),
    prisma.chapter.count({ where: { status: "PUBLISHED" } }),
    prisma.publisher.count({ where: { id: { not: PLATFORM_PUBLISHER_ID } } }),
    prisma.license.count({
      where: { status: "ACTIVE", terminatedAt: null, id: { not: PLATFORM_LICENSE_ID } },
    }),
    prisma.earningsAccount.aggregate({ _sum: { balanceUnits: true } }),
  ]);

  return {
    needsChangesComics,
    pendingLicenses,
    expiringLicenses,
    failedTransactions24h,
    userCount,
    comicCount,
    publishedChapters,
    publisherCount,
    activeLicenses,
    outstandingEarningsCoins: Number(earnings._sum.balanceUnits ?? 0n) / 100,
  };
});