import "server-only";
import type { Prisma } from "@prisma/client";
import { percentToBps } from "./units";

export interface EffectiveTerm {
  id: string;
  publisherBps: number;
}

export async function resolveLicenseTerm(
  db: Prisma.TransactionClient,
  licenseId: string,
  at: Date = new Date()
): Promise<EffectiveTerm> {
  const existing = await db.licenseTerm.findFirst({
    where: { licenseId, validFrom: { lte: at } },
    orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
    select: { id: true, royaltyPercentage: true },
  });
  if (existing) {
    return { id: existing.id, publisherBps: percentToBps(existing.royaltyPercentage.toString()) };
  }

  const license = await db.license.findUniqueOrThrow({
    where: { id: licenseId },
    select: { royaltyPercentage: true, createdAt: true },
  });
  const created = await db.licenseTerm.upsert({
    where: { licenseId_validFrom: { licenseId, validFrom: license.createdAt } },
    update: {},
    create: { licenseId, royaltyPercentage: license.royaltyPercentage, validFrom: license.createdAt },
    select: { id: true, royaltyPercentage: true },
  });
  return { id: created.id, publisherBps: percentToBps(created.royaltyPercentage.toString()) };
}