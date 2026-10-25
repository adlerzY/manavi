"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, getPublisherContext } from "@/lib/auth";
import { UNITS_PER_COIN } from "@/lib/units";

export interface EditionRoyaltySummary {
  editionId: string;
  workTitle: string;
  language: string;
  royaltyPercentage: number;
  grossCoins: number;
  publisherShareCoins: number;
  memberShareCoins: number;
  retainedCoins: number;
}

export async function getRoyaltyDashboard(): Promise<{ summaries: EditionRoyaltySummary[]; totalOwedCoins: number }> {
  const user = await getSessionUser();
  const context = await getPublisherContext(user);
  if (!context) return { summaries: [], totalOwedCoins: 0 };

  const editions = await prisma.edition.findMany({
    where: { publisherId: context.publisherId },
    select: {
      id: true,
      language: true,
      work: { select: { title: true } },
      license: { select: { royaltyPercentage: true } },
    },
  });
  if (editions.length === 0) return { summaries: [], totalOwedCoins: 0 };

  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);

  const rows = await prisma.$queryRaw<{ editionId: string; beneficiaryType: string; units: bigint }[]>`
    SELECT s."editionId", ra."beneficiaryType"::text AS "beneficiaryType", COALESCE(SUM(ra."allocatedUnits"), 0)::bigint AS units
    FROM "RevenueAllocation" ra
    JOIN "SaleLine" sl ON sl."id" = ra."saleLineId"
    JOIN "Sale" s ON s."id" = sl."saleId"
    WHERE s."editionId" IN (${Prisma.join(editions.map((edition) => edition.id))})
      AND s."createdAt" >= ${periodStart}
    GROUP BY s."editionId", ra."beneficiaryType"`;

  const unitsByEdition = new Map<string, { PLATFORM: number; PUBLISHER: number; USER: number }>();
  for (const row of rows) {
    const bucket = unitsByEdition.get(row.editionId) ?? { PLATFORM: 0, PUBLISHER: 0, USER: 0 };
    if (row.beneficiaryType === "PLATFORM" || row.beneficiaryType === "PUBLISHER" || row.beneficiaryType === "USER") {
      bucket[row.beneficiaryType] += Number(row.units);
    }
    unitsByEdition.set(row.editionId, bucket);
  }

  const summaries: EditionRoyaltySummary[] = [];
  let totalOwedCoins = 0;

  for (const edition of editions) {
    const bucket = unitsByEdition.get(edition.id);
    if (!bucket) continue;
    const gross = bucket.PLATFORM + bucket.PUBLISHER + bucket.USER;
    const publisherShare = bucket.PUBLISHER + bucket.USER;
    totalOwedCoins += publisherShare / UNITS_PER_COIN;
    summaries.push({
      editionId: edition.id,
      workTitle: edition.work.title,
      language: edition.language,
      royaltyPercentage: Number(edition.license.royaltyPercentage),
      grossCoins: gross / UNITS_PER_COIN,
      publisherShareCoins: publisherShare / UNITS_PER_COIN,
      memberShareCoins: bucket.USER / UNITS_PER_COIN,
      retainedCoins: bucket.PUBLISHER / UNITS_PER_COIN,
    });
  }

  return { summaries, totalOwedCoins };
}