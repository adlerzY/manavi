import { cache } from "react";
import { prisma } from "@/lib/prisma";

export interface AdminNavCounts {
  approvals: number;
  pendingChapters: number;
  pendingComics: number;
  pendingComments: number;
  openReports: number;
  moderation: number;
  disputedLines: number;
  readyToPayLines: number;
  payouts: number;
}

const ZERO_COUNTS: AdminNavCounts = {
  approvals: 0,
  pendingChapters: 0,
  pendingComics: 0,
  pendingComments: 0,
  openReports: 0,
  moderation: 0,
  disputedLines: 0,
  readyToPayLines: 0,
  payouts: 0,
};

export const getAdminNavCounts = cache(async (): Promise<AdminNavCounts> => {
  try {
    const [pendingChapters, pendingComics, pendingComments, openReports, disputedLines, readyToPayLines] = await Promise.all([
      prisma.chapter.count({ where: { status: "PENDING_APPROVAL" } }),
      prisma.comic.count({ where: { approvalStatus: "PENDING_APPROVAL" } }),
      prisma.comment.count({ where: { status: "PENDING" } }),
      prisma.contentReport.count({ where: { status: "OPEN" } }),
      prisma.settlementLine.count({ where: { status: "DISPUTED" } }),
      prisma.settlementLine.count({ where: { status: { in: ["APPROVED_FOR_PAYMENT", "PARTIALLY_PAID"] } } }),
    ]);
    return {
      approvals: pendingChapters + pendingComics,
      pendingChapters,
      pendingComics,
      pendingComments,
      openReports,
      moderation: pendingChapters + pendingComics + pendingComments + openReports,
      disputedLines,
      readyToPayLines,
      payouts: disputedLines + readyToPayLines,
    };
  } catch (err) {
    console.error("[admin-counts] nav counts failed", err);
    return ZERO_COUNTS;
  }
});