import "server-only";
import { Prisma } from "@prisma/client";
import type { ChapterStatus, ComicApprovalStatus, EditionStatus } from "@prisma/client";
import { prisma } from "./prisma";

function readState<T>(value: unknown): T | null {
  return value !== null && typeof value === "object" ? (value as T) : null;
}

export async function trashChapter(chapterId: string, actorId: string) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, comicId: true, status: true, publishedAt: true, scheduledAt: true, isLocked: true, deletedAt: true },
  });
  if (!chapter || chapter.deletedAt) return null;

  await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      deletedAt: new Date(),
      deletedById: actorId,
      deletedState: {
        status: chapter.status,
        publishedAt: chapter.publishedAt ? chapter.publishedAt.toISOString() : null,
        scheduledAt: chapter.scheduledAt ? chapter.scheduledAt.toISOString() : null,
        isLocked: chapter.isLocked,
      },
      status: "DRAFT",
      publishedAt: null,
      scheduledAt: null,
      isLocked: true,
    },
  });
  return chapter;
}

export async function restoreChapter(chapterId: string) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, comicId: true, deletedAt: true, deletedState: true, comic: { select: { slug: true } } },
  });
  if (!chapter || !chapter.deletedAt) return null;

  const state = readState<{ status: ChapterStatus; publishedAt: string | null; scheduledAt: string | null; isLocked: boolean }>(
    chapter.deletedState
  );

  await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      deletedAt: null,
      deletedById: null,
      deletedState: Prisma.JsonNull,
      status: state?.status ?? "DRAFT",
      publishedAt: state?.publishedAt ? new Date(state.publishedAt) : null,
      scheduledAt: state?.scheduledAt ? new Date(state.scheduledAt) : null,
      isLocked: state?.isLocked ?? false,
    },
  });
  return chapter;
}

export async function trashComic(comicId: string, actorId: string) {
  const comic = await prisma.comic.findUnique({
    where: { id: comicId },
    select: { id: true, slug: true, approvalStatus: true, isFeaturedOnHome: true, deletedAt: true },
  });
  if (!comic || comic.deletedAt) return null;

  await prisma.comic.update({
    where: { id: comicId },
    data: {
      deletedAt: new Date(),
      deletedById: actorId,
      deletedState: { approvalStatus: comic.approvalStatus, isFeaturedOnHome: comic.isFeaturedOnHome },
      approvalStatus: "NEEDS_CHANGES",
      rejectionNote: "این عنوان حذف شده است",
      isFeaturedOnHome: false,
    },
  });
  return comic;
}

export async function restoreComic(comicId: string) {
  const comic = await prisma.comic.findUnique({
    where: { id: comicId },
    select: { id: true, slug: true, deletedAt: true, deletedState: true },
  });
  if (!comic || !comic.deletedAt) return null;

  const state = readState<{ approvalStatus: ComicApprovalStatus; isFeaturedOnHome: boolean }>(comic.deletedState);

  await prisma.comic.update({
    where: { id: comicId },
    data: {
      deletedAt: null,
      deletedById: null,
      deletedState: Prisma.JsonNull,
      approvalStatus: state?.approvalStatus ?? "APPROVED",
      rejectionNote: null,
      isFeaturedOnHome: state?.isFeaturedOnHome ?? false,
    },
  });
  return comic;
}

export async function trashEdition(editionId: string, actorId: string) {
  const edition = await prisma.edition.findUnique({
    where: { id: editionId },
    select: { id: true, workId: true, status: true, deletedAt: true, work: { select: { slug: true } } },
  });
  if (!edition || edition.deletedAt) return null;

  await prisma.edition.update({
    where: { id: editionId },
    data: { deletedAt: new Date(), deletedById: actorId, deletedState: { status: edition.status }, status: "DRAFT" },
  });
  return edition;
}

export async function restoreEdition(editionId: string) {
  const edition = await prisma.edition.findUnique({
    where: { id: editionId },
    select: { id: true, workId: true, deletedAt: true, deletedState: true, work: { select: { slug: true } } },
  });
  if (!edition || !edition.deletedAt) return null;

  const state = readState<{ status: EditionStatus }>(edition.deletedState);

  await prisma.edition.update({
    where: { id: editionId },
    data: { deletedAt: null, deletedById: null, deletedState: Prisma.JsonNull, status: state?.status ?? "ACTIVE" },
  });
  return edition;
}