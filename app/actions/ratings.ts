"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/moderation";
import { safeError } from "@/lib/errors";
import { averageScore, requiredReadChapters } from "@/lib/rating";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface RatingSummary {
  average: number;
  count: number;
  myScore: number;
}

function validScore(score: number): boolean {
  return Number.isInteger(score) && score >= 1 && score <= 5;
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002");
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err)) return fn();
    throw err;
  }
}

async function guard(score: number): Promise<{ userId: string } | { error: string }> {
  const user = await getSessionUser();
  if (!user) return { error: "برای امتیازدهی باید وارد شوید" };
  if (user.isBanned) return { error: "حساب شما مسدود شده است" };
  if (!validScore(score)) return { error: "امتیاز نامعتبر است" };
  const allowed = await checkRateLimit(`rate:${user.id}`, 20);
  if (!allowed) return { error: "تعداد درخواست‌ها بیش از حد مجاز است" };
  return { userId: user.id };
}

export async function rateWork(workId: string, score: number): Promise<ActionResult<RatingSummary>> {
  try {
    const checked = await guard(score);
    if ("error" in checked) return { success: false, error: checked.error };
    const { userId } = checked;

    const reads = await prisma.chapterReadMark.count({ where: { userId, comicId: workId } });
    if (reads < 1) return { success: false, error: "برای امتیازدهی ابتدا بخشی از اثر را بخوانید" };

    const comic = await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const existing = await tx.workRating.findUnique({ where: { userId_workId: { userId, workId } } });
        if (existing) {
          if (existing.score !== score) {
            await tx.workRating.update({ where: { id: existing.id }, data: { score } });
            await tx.comic.update({ where: { id: workId }, data: { ratingTotal: { increment: score - existing.score } } });
          }
        } else {
          await tx.workRating.create({ data: { userId, workId, score } });
          await tx.comic.update({ where: { id: workId }, data: { ratingCount: { increment: 1 }, ratingTotal: { increment: score } } });
        }
        return tx.comic.findUniqueOrThrow({ where: { id: workId }, select: { slug: true, ratingCount: true, ratingTotal: true } });
      })
    );

    revalidatePath(`/app/comic/${comic.slug}`);
    return {
      success: true,
      data: { average: averageScore(comic.ratingTotal, comic.ratingCount), count: comic.ratingCount, myScore: score },
    };
  } catch (err) {
    return safeError(err);
  }
}

export async function rateEdition(editionId: string, score: number): Promise<ActionResult<RatingSummary>> {
  try {
    const checked = await guard(score);
    if ("error" in checked) return { success: false, error: checked.error };
    const { userId } = checked;

    const [publishedCount, reads] = await Promise.all([
      prisma.chapter.count({ where: { editionId, publishedAt: { not: null } } }),
      prisma.chapterReadMark.count({ where: { userId, chapter: { editionId } } }),
    ]);
    if (reads < requiredReadChapters(publishedCount)) {
      return { success: false, error: "برای امتیاز به این نسخه باید حداقل بخشی از چپترهای آن را خوانده باشید" };
    }

    const edition = await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const existing = await tx.editionRating.findUnique({ where: { userId_editionId: { userId, editionId } } });
        if (existing) {
          if (existing.score !== score) {
            await tx.editionRating.update({ where: { id: existing.id }, data: { score } });
            await tx.edition.update({ where: { id: editionId }, data: { ratingTotal: { increment: score - existing.score } } });
          }
        } else {
          await tx.editionRating.create({ data: { userId, editionId, score } });
          await tx.edition.update({ where: { id: editionId }, data: { ratingCount: { increment: 1 }, ratingTotal: { increment: score } } });
        }
        return tx.edition.findUniqueOrThrow({
          where: { id: editionId },
          select: { ratingCount: true, ratingTotal: true, work: { select: { slug: true } } },
        });
      })
    );

    revalidatePath(`/app/comic/${edition.work.slug}`);
    return {
      success: true,
      data: { average: averageScore(edition.ratingTotal, edition.ratingCount), count: edition.ratingCount, myScore: score },
    };
  } catch (err) {
    return safeError(err);
  }
}