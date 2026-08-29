"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { resolveExploreWhere, type ExploreFilters } from "@/lib/explore";
import { checkRateLimit } from "@/lib/moderation";

export async function getExploreResultsCount(filters: ExploreFilters): Promise<number> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const allowed = await checkRateLimit(`explore-count:${ip}`, 30);
  if (!allowed) return 0;

  const where = await resolveExploreWhere(filters);
  return prisma.comic.count({ where });
}