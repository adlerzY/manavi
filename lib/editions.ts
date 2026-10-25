import "server-only";
import type { EditionStatus, LicenseStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { adjustedScore, requiredReadChapters } from "./rating";

const DEFAULT_LANGUAGE = "fa";

export interface EditionSummary {
  id: string;
  workId: string;
  language: string;
  title: string | null;
  status: EditionStatus;
  publisherId: string;
  publisherName: string;
  publisherAvatarUrl: string | null;
  licenseStatus: LicenseStatus;
  priceCoinsOverride: number | null;
  crossUnlockEnabled: boolean;
  ratingCount: number;
  ratingTotal: number;
  chapterCount: number;
  latestPublishedAt: Date | null;
}

export async function ensureDefaultEdition(workId: string): Promise<void> {
  const existing = await prisma.edition.count({ where: { workId } });
  if (existing > 0) return;

  const comic = await prisma.comic.findUnique({
    where: { id: workId },
    select: { licenseId: true, license: { select: { publisherId: true } } },
  });
  if (!comic) return;

  await prisma.edition.upsert({
    where: {
      workId_publisherId_language: { workId, publisherId: comic.license.publisherId, language: DEFAULT_LANGUAGE },
    },
    update: {},
    create: { workId, publisherId: comic.license.publisherId, licenseId: comic.licenseId, language: DEFAULT_LANGUAGE },
  });
}

export async function getPrimaryEditionId(workId: string): Promise<string | null> {
  const comic = await prisma.comic.findUnique({ where: { id: workId }, select: { licenseId: true } });
  if (!comic) return null;

  await ensureDefaultEdition(workId);

  const matching = await prisma.edition.findFirst({
    where: { workId, licenseId: comic.licenseId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (matching) return matching.id;

  const any = await prisma.edition.findFirst({ where: { workId }, orderBy: { createdAt: "asc" }, select: { id: true } });
  return any?.id ?? null;
}

export async function getWorkEditions(workId: string): Promise<EditionSummary[]> {
  await ensureDefaultEdition(workId);

  const rows = await prisma.edition.findMany({
    where: { workId, status: { in: ["ACTIVE", "ARCHIVED"] } },
    select: {
      id: true,
      workId: true,
      language: true,
      title: true,
      status: true,
      publisherId: true,
      priceCoinsOverride: true,
      crossUnlockEnabled: true,
      ratingCount: true,
      ratingTotal: true,
      publisher: { select: { name: true, avatarUrl: true } },
      license: { select: { status: true } },
      _count: { select: { chapters: { where: { publishedAt: { not: null } } } } },
    },
  });

  const latest = rows.length
    ? await prisma.chapter.groupBy({
        by: ["editionId"],
        where: { editionId: { in: rows.map((row) => row.id) }, publishedAt: { not: null } },
        _max: { publishedAt: true },
      })
    : [];
  const latestByEdition = new Map(latest.map((entry) => [entry.editionId, entry._max.publishedAt]));

  const summaries: EditionSummary[] = rows.map((row) => ({
    id: row.id,
    workId: row.workId,
    language: row.language,
    title: row.title,
    status: row.status,
    publisherId: row.publisherId,
    publisherName: row.publisher.name,
    publisherAvatarUrl: row.publisher.avatarUrl,
    licenseStatus: row.license.status,
    priceCoinsOverride: row.priceCoinsOverride,
    crossUnlockEnabled: row.crossUnlockEnabled,
    ratingCount: row.ratingCount,
    ratingTotal: row.ratingTotal,
    chapterCount: row._count.chapters,
    latestPublishedAt: latestByEdition.get(row.id) ?? null,
  }));

  summaries.sort((a, b) => {
    const activeDiff = Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE");
    if (activeDiff !== 0) return activeDiff;
    const scoreDiff = adjustedScore(b.ratingTotal, b.ratingCount) - adjustedScore(a.ratingTotal, a.ratingCount);
    if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
    return (b.latestPublishedAt?.getTime() ?? 0) - (a.latestPublishedAt?.getTime() ?? 0);
  });

  return summaries;
}

export function pickEdition(editions: EditionSummary[], editionId?: string, language?: string): EditionSummary | null {
  if (editions.length === 0) return null;
  const byId = editionId ? editions.find((edition) => edition.id === editionId) : undefined;
  if (byId) return byId;
  const pool = language ? editions.filter((edition) => edition.language === language) : [];
  return (pool.length > 0 ? pool : editions)[0];
}

export interface RatingContext {
  workScore: number | null;
  editionScore: number | null;
  canRateWork: boolean;
  canRateEdition: boolean;
}

export async function getUserRatingContext(
  userId: string | null,
  workId: string,
  editionId: string,
  publishedCount: number
): Promise<RatingContext> {
  if (!userId) return { workScore: null, editionScore: null, canRateWork: false, canRateEdition: false };

  const [workRating, editionRating, workReads, editionReads] = await Promise.all([
    prisma.workRating.findUnique({ where: { userId_workId: { userId, workId } }, select: { score: true } }),
    prisma.editionRating.findUnique({ where: { userId_editionId: { userId, editionId } }, select: { score: true } }),
    prisma.chapterReadMark.count({ where: { userId, comicId: workId } }),
    prisma.chapterReadMark.count({ where: { userId, chapter: { editionId } } }),
  ]);

  return {
    workScore: workRating?.score ?? null,
    editionScore: editionRating?.score ?? null,
    canRateWork: workReads >= 1,
    canRateEdition: editionReads >= requiredReadChapters(publishedCount),
  };
}

export async function getUserEditionRequest(userId: string, workId: string): Promise<{ language: string } | null> {
  const row = await prisma.editionRequest.findUnique({
    where: { userId_workId: { userId, workId } },
    select: { status: true, language: true },
  });
  return row && row.status === "ACTIVE" ? { language: row.language } : null;
}