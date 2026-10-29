"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { Prisma, ReportCategory, ReportStatus, ReportTargetType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { logAuditEvent } from "@/lib/audit-log";
import { createNotifications } from "@/lib/notifications";
import { invalidateChapterAccessList } from "@/lib/chapters";
import { languageLabel } from "@/lib/languages";
import { REPORT_STATUS_LABELS } from "@/lib/report-labels";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

const PAGE_SIZE = 25;
const OPEN_STATUSES: ReportStatus[] = ["OPEN", "UNDER_REVIEW"];

export type ReportDecision = "REVIEW" | "REJECT" | "RESOLVE" | "DISABLE_CHAPTER" | "HIDE_COMMENT" | "SUSPEND_EDITION";
export type ReportStatusFilter = ReportStatus | "ACTIVE" | "";

export interface ReportTargetInfo {
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  href: string | null;
  actioned: boolean;
}

export interface ReportRow {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  category: ReportCategory;
  details: string | null;
  status: ReportStatus;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reporter: { firstName: string; username: string | null };
  target: ReportTargetInfo | null;
}

function displayName(user: { firstName: string; username: string | null }): string {
  return user.username ? `@${user.username}` : user.firstName;
}

async function loadTargets(rows: { targetType: ReportTargetType; targetId: string }[]): Promise<Map<string, ReportTargetInfo>> {
  const idsOf = (type: ReportTargetType) => [...new Set(rows.filter((row) => row.targetType === type).map((row) => row.targetId))];

  const [chapters, comments, editions, works] = await Promise.all([
    prisma.chapter.findMany({
      where: { id: { in: idsOf("EDITION_CHAPTER") } },
      select: { id: true, chapterNumber: true, isLocked: true, edition: { select: { language: true } }, comic: { select: { title: true } } },
    }),
    prisma.comment.findMany({
      where: { id: { in: idsOf("COMMENT") } },
      select: {
        id: true,
        content: true,
        status: true,
        chapterId: true,
        user: { select: { firstName: true, username: true } },
        chapter: { select: { chapterNumber: true, comic: { select: { title: true } } } },
      },
    }),
    prisma.edition.findMany({
      where: { id: { in: idsOf("EDITION") } },
      select: {
        id: true,
        status: true,
        language: true,
        publisher: { select: { name: true } },
        work: { select: { title: true, slug: true } },
      },
    }),
    prisma.comic.findMany({ where: { id: { in: idsOf("WORK") } }, select: { id: true, title: true, slug: true } }),
  ]);

  const map = new Map<string, ReportTargetInfo>();

  for (const chapter of chapters) {
    map.set(`EDITION_CHAPTER:${chapter.id}`, {
      title: `${chapter.comic.title} — چپتر ${chapter.chapterNumber.toLocaleString("fa-IR")}`,
      subtitle: `زبان ${languageLabel(chapter.edition.language)}`,
      excerpt: null,
      href: `/app/read/${chapter.id}`,
      actioned: chapter.isLocked,
    });
  }
  for (const comment of comments) {
    map.set(`COMMENT:${comment.id}`, {
      title: `نظر ${displayName(comment.user)}`,
      subtitle: `${comment.chapter.comic.title} — چپتر ${comment.chapter.chapterNumber.toLocaleString("fa-IR")}`,
      excerpt: comment.content.slice(0, 240),
      href: `/app/read/${comment.chapterId}`,
      actioned: comment.status === "REJECTED",
    });
  }
  for (const edition of editions) {
    map.set(`EDITION:${edition.id}`, {
      title: `${edition.work.title} — ${edition.publisher.name}`,
      subtitle: `زبان ${languageLabel(edition.language)}`,
      excerpt: null,
      href: `/app/comic/${edition.work.slug}?edition=${edition.id}`,
      actioned: edition.status === "SUSPENDED",
    });
  }
  for (const work of works) {
    map.set(`WORK:${work.id}`, {
      title: work.title,
      subtitle: null,
      excerpt: null,
      href: `/app/comic/${work.slug}`,
      actioned: false,
    });
  }

  return map;
}

export async function listReports(params: {
  status?: ReportStatusFilter;
  targetType?: ReportTargetType | "";
  page?: number;
}): Promise<{ reports: ReportRow[]; total: number }> {
  await requireAdmin();

  const page = Math.max(1, params.page ?? 1);
  const status = params.status === undefined ? "ACTIVE" : params.status;

  const where: Prisma.ContentReportWhereInput = {
    ...(status === "ACTIVE" ? { status: { in: OPEN_STATUSES } } : status ? { status } : {}),
    ...(params.targetType ? { targetType: params.targetType } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.contentReport.findMany({
      where,
      orderBy: { createdAt: status === "ACTIVE" ? "asc" : "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        targetType: true,
        targetId: true,
        category: true,
        details: true,
        status: true,
        resolutionNote: true,
        createdAt: true,
        resolvedAt: true,
        reporter: { select: { firstName: true, username: true } },
      },
    }),
    prisma.contentReport.count({ where }),
  ]);

  const targets = await loadTargets(rows);

  return {
    reports: rows.map((row) => ({
      id: row.id,
      targetType: row.targetType,
      targetId: row.targetId,
      category: row.category,
      details: row.details,
      status: row.status,
      resolutionNote: row.resolutionNote,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      reporter: row.reporter,
      target: targets.get(`${row.targetType}:${row.targetId}`) ?? null,
    })),
    total,
  };
}

function nextStatusFor(decision: ReportDecision): ReportStatus {
  if (decision === "REVIEW") return "UNDER_REVIEW";
  if (decision === "REJECT") return "REJECTED";
  if (decision === "RESOLVE") return "RESOLVED";
  return "ACTION_TAKEN";
}

async function applySideEffect(
  decision: ReportDecision,
  targetType: ReportTargetType,
  targetId: string,
  adminId: string
): Promise<string | null> {
  if (decision === "DISABLE_CHAPTER") {
    if (targetType !== "EDITION_CHAPTER") return "این اقدام برای این نوع گزارش مجاز نیست";
    const chapter = await prisma.chapter.findUnique({
      where: { id: targetId },
      select: { id: true, comicId: true, comic: { select: { slug: true } } },
    });
    if (!chapter) return "چپتر یافت نشد";
    await prisma.chapter.update({ where: { id: chapter.id }, data: { isLocked: true } });
    invalidateChapterAccessList(chapter.comicId);
    revalidatePath(`/app/comic/${chapter.comic.slug}`);
    revalidatePath(`/app/read/${chapter.id}`);
    revalidatePath(`/admin/comics/${chapter.comicId}`);
    return null;
  }

  if (decision === "HIDE_COMMENT") {
    if (targetType !== "COMMENT") return "این اقدام برای این نوع گزارش مجاز نیست";
    const comment = await prisma.comment.findUnique({ where: { id: targetId }, select: { id: true, chapterId: true } });
    if (!comment) return "نظر یافت نشد";
    await prisma.comment.update({
      where: { id: comment.id },
      data: { status: "REJECTED", moderatedById: adminId, moderatedAt: new Date() },
    });
    revalidatePath(`/app/read/${comment.chapterId}`);
    return null;
  }

  if (decision === "SUSPEND_EDITION") {
    if (targetType !== "EDITION") return "این اقدام برای این نوع گزارش مجاز نیست";
    const edition = await prisma.edition.findUnique({
      where: { id: targetId },
      select: { id: true, workId: true, work: { select: { slug: true } } },
    });
    if (!edition) return "نسخه یافت نشد";
    await prisma.edition.update({ where: { id: edition.id }, data: { status: "SUSPENDED" } });
    invalidateChapterAccessList(edition.workId);
    revalidatePath(`/app/comic/${edition.work.slug}`);
    return null;
  }

  return null;
}

export async function processReport(input: {
  reportId: string;
  decision: ReportDecision;
  note?: string;
}): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const note = input.note?.trim().slice(0, 500) || null;

    const report = await prisma.contentReport.findUnique({
      where: { id: input.reportId },
      select: { id: true, targetType: true, targetId: true, status: true },
    });
    if (!report) return { success: false, error: "گزارش یافت نشد" };
    if (!OPEN_STATUSES.includes(report.status)) return { success: false, error: "این گزارش قبلاً بسته شده است" };
    if (input.decision === "REVIEW" && report.status === "UNDER_REVIEW") return { success: true };

    const sideEffectError = await applySideEffect(input.decision, report.targetType, report.targetId, admin.id);
    if (sideEffectError) return { success: false, error: sideEffectError };

    const nextStatus = nextStatusFor(input.decision);
    const closing = nextStatus !== "UNDER_REVIEW";
    const scope: Prisma.ContentReportWhereInput =
      nextStatus === "ACTION_TAKEN"
        ? { targetType: report.targetType, targetId: report.targetId, status: { in: OPEN_STATUSES } }
        : { id: report.id };

    const affected = await prisma.contentReport.findMany({ where: scope, select: { id: true, reporterId: true } });

    await prisma.contentReport.updateMany({
      where: scope,
      data: {
        status: nextStatus,
        moderatorId: admin.id,
        resolutionNote: note,
        resolvedAt: closing ? new Date() : null,
      },
    });

    if (closing) {
      const recipients = affected.filter((entry) => entry.reporterId !== admin.id);
      after(() =>
        createNotifications(
          recipients.map((entry) => ({
            userId: entry.reporterId,
            type: "SYSTEM" as const,
            title: "گزارش شما بررسی شد",
            body: note ? `${REPORT_STATUS_LABELS[nextStatus]} — ${note}` : REPORT_STATUS_LABELS[nextStatus],
            dedupeKey: `report-closed:${entry.id}`,
          }))
        ).catch(() => {})
      );
    }

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "report.resolve",
        targetType: report.targetType,
        targetId: report.targetId,
        metadata: { reportId: report.id, decision: input.decision, status: nextStatus, note },
      })
    );

    revalidatePath("/admin/moderation");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}