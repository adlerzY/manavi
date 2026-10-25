import "server-only";
import type { BeneficiaryType, StaffRole } from "@prisma/client";
import { prisma } from "./prisma";
import { isLicenseCurrentlyActive } from "./license";
import { getChapterUnlockCoinCost, getCoinPriceUsdt } from "./platform-settings";
import { applyWalletDelta, postLedgerEntries, InsufficientCoinsError, type LedgerEntryInput } from "./ledger";
import { allocateRevenue } from "./allocation";
import { resolveLicenseTerm } from "./license-terms";
import { coinsToUnits, unitsToUsdtMicro } from "./units";

export interface PurchaseInput {
  buyerId: string;
  editionId: string;
  chapterIds?: string[];
  kind: "SINGLE" | "BULK";
  idempotencyKey: string;
}

export interface PurchaseResult {
  success: boolean;
  error?: string;
  saleId?: string;
  comicId?: string;
  comicSlug?: string;
  purchasedChapterIds: string[];
  crossUnlockedChapterIds: string[];
  totalCoins: number;
}

class PurchaseRejectedError extends Error {}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002");
}

async function findExistingSale(buyerId: string, key: string): Promise<PurchaseResult | null> {
  const sale = await prisma.sale.findUnique({
    where: { idempotencyKey: key },
    select: { id: true, buyerId: true, totalCoins: true, lines: { select: { chapterId: true } } },
  });
  if (!sale) return null;
  if (sale.buyerId !== buyerId) {
    return { success: false, error: "کلید تکرار نامعتبر است", purchasedChapterIds: [], crossUnlockedChapterIds: [], totalCoins: 0 };
  }
  return {
    success: true,
    saleId: sale.id,
    purchasedChapterIds: sale.lines.map((line) => line.chapterId),
    crossUnlockedChapterIds: [],
    totalCoins: sale.totalCoins,
  };
}

export async function purchaseChapters(input: PurchaseInput): Promise<PurchaseResult> {
  const fail = (error: string): PurchaseResult => ({
    success: false,
    error,
    purchasedChapterIds: [],
    crossUnlockedChapterIds: [],
    totalCoins: 0,
  });

  const replay = await findExistingSale(input.buyerId, input.idempotencyKey);
  if (replay) return replay;

  const [defaultPrice, coinPriceUsdt, edition] = await Promise.all([
    getChapterUnlockCoinCost(),
    getCoinPriceUsdt(),
    prisma.edition.findUnique({
      where: { id: input.editionId },
      select: {
        id: true,
        status: true,
        publisherId: true,
        licenseId: true,
        priceCoinsOverride: true,
        work: { select: { id: true, slug: true } },
        license: { select: { status: true, terminatedAt: true, startDate: true, endDate: true } },
      },
    }),
  ]);

  if (!edition || edition.status !== "ACTIVE") return fail("این نسخه در دسترس نیست");
  if (!isLicenseCurrentlyActive(edition.license)) return fail("این عنوان موقتاً در دسترس نیست");

  const price = edition.priceCoinsOverride ?? defaultPrice;
  const unitsAmount = coinsToUnits(price);

  try {
    const outcome = await prisma.$transaction(
      async (tx) => {
        const candidates = await tx.chapter.findMany({
          where: {
            editionId: edition.id,
            status: "PUBLISHED",
            accessType: "COIN",
            isLocked: false,
            entitlements: { none: { userId: input.buyerId } },
            ...(input.chapterIds ? { id: { in: input.chapterIds } } : {}),
          },
          orderBy: { chapterNumber: "asc" },
          select: { id: true, episodeId: true },
        });
        if (candidates.length === 0) {
          throw new PurchaseRejectedError(
            input.kind === "SINGLE" ? "این چپتر قابل خرید نیست" : "همه چپترهای این نسخه قبلاً باز شده‌اند یا چپتر سکه‌ای وجود ندارد"
          );
        }

        const term = await resolveLicenseTerm(tx, edition.licenseId);

        const sale = await tx.sale.create({
          data: {
            buyerId: input.buyerId,
            editionId: edition.id,
            kind: input.kind,
            totalCoins: 0,
            coinPriceUsdt,
            idempotencyKey: input.idempotencyKey,
            licenseTermId: term.id,
          },
          select: { id: true },
        });

        const lines = await tx.saleLine.createManyAndReturn({
          data: candidates.map((candidate) => ({
            saleId: sale.id,
            chapterId: candidate.id,
            coinAmount: price,
            unitsAmount,
          })),
          select: { id: true, chapterId: true },
        });

        const granted = await tx.entitlement.createManyAndReturn({
          data: lines.map((line) => ({
            userId: input.buyerId,
            chapterId: line.chapterId,
            type: "PURCHASE" as const,
            saleLineId: line.id,
          })),
          skipDuplicates: true,
          select: { saleLineId: true },
        });

        const grantedLineIds = new Set(granted.map((entry) => entry.saleLineId));
        const lostLineIds = lines.filter((line) => !grantedLineIds.has(line.id)).map((line) => line.id);
        if (lostLineIds.length > 0) {
          await tx.saleLine.deleteMany({ where: { id: { in: lostLineIds } } });
        }

        const kept = lines.filter((line) => grantedLineIds.has(line.id));
        if (kept.length === 0) {
          await tx.sale.delete({ where: { id: sale.id } });
          throw new PurchaseRejectedError("همه چپترهای انتخاب‌شده قبلاً باز شده‌اند");
        }

        const keptChapterIds = kept.map((line) => line.chapterId);
        const episodeByChapter = new Map(candidates.map((candidate) => [candidate.id, candidate.episodeId]));

        const staffRows = await tx.chapterStaff.findMany({
          where: { chapterId: { in: keptChapterIds } },
          select: { chapterId: true, userId: true, roleTitle: true, shareBps: true },
        });
        const staffByChapter = new Map<string, { userId: string; role: StaffRole; shareBps: number }[]>();
        for (const row of staffRows) {
          const list = staffByChapter.get(row.chapterId) ?? [];
          list.push({ userId: row.userId, role: row.roleTitle, shareBps: row.shareBps });
          staffByChapter.set(row.chapterId, list);
        }

        const totals = new Map<string, { type: BeneficiaryType; id: string | null; micro: number }>();
        const allocationRows = kept.flatMap((line) =>
          allocateRevenue({
            baseUnits: unitsAmount,
            publisherBps: term.publisherBps,
            publisherId: edition.publisherId,
            staff: staffByChapter.get(line.chapterId) ?? [],
          }).map((allocation) => {
            const micro = unitsToUsdtMicro(allocation.allocatedUnits, coinPriceUsdt);
            const key = `${allocation.beneficiaryType}:${allocation.beneficiaryId ?? "platform"}`;
            const current = totals.get(key) ?? { type: allocation.beneficiaryType, id: allocation.beneficiaryId, micro: 0 };
            current.micro += micro;
            totals.set(key, current);
            return {
              saleLineId: line.id,
              beneficiaryType: allocation.beneficiaryType,
              beneficiaryId: allocation.beneficiaryId,
              role: allocation.role,
              baseUnits: unitsAmount,
              publisherBps: term.publisherBps,
              memberShareBps: allocation.memberShareBps,
              allocatedUnits: allocation.allocatedUnits,
              usdtMicro: micro,
              licenseTermId: term.id,
            };
          })
        );
        await tx.revenueAllocation.createMany({ data: allocationRows });

        const totalCoins = kept.length * price;

        await applyWalletDelta(tx, {
          userId: input.buyerId,
          coinsDelta: -totalCoins,
          sourceType: "SALE",
          sourceId: sale.id,
          idempotencyKey: `sale:${sale.id}:wallet`,
        });

        const ledgerRows: LedgerEntryInput[] = [];
        for (const [key, total] of totals) {
          if (total.micro <= 0) continue;
          ledgerRows.push({
            account: total.type === "PLATFORM" ? "PLATFORM_REVENUE" : "BENEFICIARY_PAYABLE",
            ownerType: total.type === "PLATFORM" ? "PLATFORM" : total.type === "PUBLISHER" ? "PUBLISHER" : "USER",
            ownerId: total.id,
            direction: "CREDIT",
            amount: total.micro,
            currency: "USDT_MICRO",
            sourceType: "SALE",
            sourceId: sale.id,
            idempotencyKey: `sale:${sale.id}:${key}`,
          });
        }
        await postLedgerEntries(tx, ledgerRows);

        await tx.sale.update({ where: { id: sale.id }, data: { totalCoins } });

        await tx.transaction.create({
          data: {
            type: "CHAPTER_UNLOCK",
            status: "PAID",
            amount: totalCoins,
            currency: "COIN",
            payerId: input.buyerId,
            comicId: edition.work.id,
            message: input.kind === "BULK" ? `خرید گروهی — ${kept.length} چپتر` : null,
          },
        });

        const episodeIds = keptChapterIds.map((id) => episodeByChapter.get(id)).filter((id): id is string => Boolean(id));
        let crossUnlockedChapterIds: string[] = [];
        if (episodeIds.length > 0) {
          const targets = await tx.chapter.findMany({
            where: {
              episodeId: { in: episodeIds },
              editionId: { not: edition.id },
              status: "PUBLISHED",
              isLocked: false,
              accessType: "COIN",
              edition: { workId: edition.work.id, status: "ACTIVE", crossUnlockEnabled: true },
            },
            select: { id: true },
          });
          if (targets.length > 0) {
            const created = await tx.entitlement.createManyAndReturn({
              data: targets.map((target) => ({ userId: input.buyerId, chapterId: target.id, type: "CROSS_UNLOCK" as const })),
              skipDuplicates: true,
              select: { chapterId: true },
            });
            crossUnlockedChapterIds = created.map((entry) => entry.chapterId);
          }
        }

        return { saleId: sale.id, purchasedChapterIds: keptChapterIds, crossUnlockedChapterIds, totalCoins };
      },
      { timeout: 20_000, maxWait: 5_000 }
    );

    return { success: true, comicId: edition.work.id, comicSlug: edition.work.slug, ...outcome };
  } catch (err) {
    if (err instanceof PurchaseRejectedError) return fail(err.message);
    if (err instanceof InsufficientCoinsError) {
      return fail(input.kind === "SINGLE" ? "سکه کافی نیست" : `سکه کافی نیست — ${err.required.toLocaleString("fa-IR")} سکه لازم است`);
    }
    if (isUniqueViolation(err)) {
      const again = await findExistingSale(input.buyerId, input.idempotencyKey);
      if (again) return again;
    }
    throw err;
  }
}