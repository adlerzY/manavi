"use server";

import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/moderation";

const MAX_SEARCH_TERM_LENGTH = 100;
const TOP_TERMS_REVALIDATE_SECONDS = 600;

export async function recordSearchTerm(term: string): Promise<void> {
  const trimmed = term.trim().slice(0, MAX_SEARCH_TERM_LENGTH);
  if (!trimmed) return;

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const allowed = await checkRateLimit(`search-term:${ip}`, 20);
  if (!allowed) return;

  await prisma.searchTerm
    .upsert({
      where: { term: trimmed },
      update: { count: { increment: 1 } },
      create: { term: trimmed, count: 1 },
    })
    .catch(() => {});
}

export interface TopSearchTerm {
  term: string;
  count: number;
}

const loadTopSearchTerms = unstable_cache(
  async (limit: number): Promise<TopSearchTerm[]> =>
    prisma.searchTerm.findMany({
      orderBy: { count: "desc" },
      take: limit,
      select: { term: true, count: true },
    }),
  ["search:top-terms"],
  { revalidate: TOP_TERMS_REVALIDATE_SECONDS, tags: ["search-terms"] }
);

export async function getTopSearchTerms(limit = 10): Promise<TopSearchTerm[]> {
  return loadTopSearchTerms(limit);
}