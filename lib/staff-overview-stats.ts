import "server-only";

import { prisma } from "@/lib/prisma";
import { getSessionUser, getPublisherContext } from "@/lib/auth";
import { getReceivedDonationsUsdt } from "@/lib/donations";

export interface PublisherOverviewStats {
  publishedChapters: number;
  pendingChapters: number;
  totalDonationsUsdt: number;
}

export async function getPublisherOverviewStats(): Promise<PublisherOverviewStats | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const context = await getPublisherContext(user);
  if (!context) return null;

  const [publishedChapters, pendingChapters, totalDonationsUsdt] = await Promise.all([
    prisma.chapter.count({
      where: { status: "PUBLISHED", comic: { license: { publisherId: context.publisherId } } },
    }),
    prisma.chapter.count({
      where: { status: "PENDING_APPROVAL", comic: { license: { publisherId: context.publisherId } } },
    }),
    getReceivedDonationsUsdt(user.id),
  ]);

  return { publishedChapters, pendingChapters, totalDonationsUsdt };
}

export interface StaffOverviewStats {
  uploadedChapters: number;
  pendingChapters: number;
  totalDonationsUsdt: number;
}

export async function getStaffOverviewStats(): Promise<StaffOverviewStats | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const [uploadedChapters, pendingChapters, totalDonationsUsdt] = await Promise.all([
    prisma.chapter.count({ where: { uploadedById: user.id, status: "PUBLISHED" } }),
    prisma.chapter.count({ where: { uploadedById: user.id, status: "PENDING_APPROVAL" } }),
    getReceivedDonationsUsdt(user.id),
  ]);

  return { uploadedChapters, pendingChapters, totalDonationsUsdt };
}
