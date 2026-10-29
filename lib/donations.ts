import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { applyWalletDelta, postLedgerEntries, InsufficientCoinsError, type LedgerEntryInput } from "./ledger";
import { getCoinPriceUsdt } from "./platform-settings";
import { BPS_DENOMINATOR, coinsToUnits, microToUsdt, mulBps, unitsToUsdtMicro } from "./units";
import { DONATION_PLATFORM_BPS, MAX_DONATION_COINS, MIN_DONATION_COINS } from "./billing";

export interface DonateInput {
  donorId: string;
  receiverId: string;
  coins: number;
  message?: string | null;
  isAnonymous?: boolean;
  idempotencyKey: string;
}

export interface DonateResult {
  success: boolean;
  error?: string;
  donationId?: string;
  duplicate?: boolean;
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002");
}

async function findReplay(donorId: string, key: string): Promise<DonateResult | null> {
  const existing = await prisma.donation.findUnique({
    where: { idempotencyKey: key },
    select: { id: true, donorId: true },
  });
  if (!existing) return null;
  if (existing.donorId !== donorId) return { success: false, error: "کلید تکرار نامعتبر است" };
  return { success: true, donationId: existing.id, duplicate: true };
}

export async function isEligibleDonationReceiver(receiverId: string): Promise<boolean> {
  const receiver = await prisma.user.findFirst({
    where: {
      id: receiverId,
      isBanned: false,
      deletedAt: null,
      OR: [{ staffRoles: { some: {} } }, { chapterStaffRoles: { some: {} } }, { publisherProfile: { isNot: null } }],
    },
    select: { id: true },
  });
  return Boolean(receiver);
}

export async function donateCoins(input: DonateInput): Promise<DonateResult> {
  const replay = await findReplay(input.donorId, input.idempotencyKey);
  if (replay) return replay;

  if (input.donorId === input.receiverId) {
    return { success: false, error: "نمی‌توانید به خودتان حمایت مالی کنید" };
  }
  if (!Number.isInteger(input.coins) || input.coins < MIN_DONATION_COINS || input.coins > MAX_DONATION_COINS) {
    return {
      success: false,
      error: `مقدار حمایت باید بین ${MIN_DONATION_COINS.toLocaleString("fa-IR")} تا ${MAX_DONATION_COINS.toLocaleString("fa-IR")} سکه باشد`,
    };
  }
  if (!(await isEligibleDonationReceiver(input.receiverId))) {
    return { success: false, error: "این کاربر واجد شرایط دریافت حمایت مالی نیست" };
  }

  const coinPriceUsdt = await getCoinPriceUsdt();
  const totalUnits = coinsToUnits(input.coins);
  const platformUnits = mulBps(totalUnits, DONATION_PLATFORM_BPS);
  const receiverUnits = totalUnits - platformUnits;
  const receiverMicro = unitsToUsdtMicro(receiverUnits, coinPriceUsdt);
  const platformMicro = unitsToUsdtMicro(platformUnits, coinPriceUsdt);
  const message = input.message?.trim().slice(0, 300) || null;

  try {
    const donationId = await prisma.$transaction(
      async (tx) => {
        const donation = await tx.donation.create({
          data: {
            donorId: input.donorId,
            receiverId: input.receiverId,
            coins: input.coins,
            platformUnits,
            receiverUnits,
            receiverUsdtMicro: receiverMicro,
            coinPriceUsdt,
            message,
            isAnonymous: Boolean(input.isAnonymous),
            idempotencyKey: input.idempotencyKey,
          },
          select: { id: true },
        });

        await applyWalletDelta(tx, {
          userId: input.donorId,
          coinsDelta: -input.coins,
          sourceType: "DONATION",
          sourceId: donation.id,
          idempotencyKey: `donation:${donation.id}:wallet`,
        });

        const allocations: Prisma.RevenueAllocationCreateManyInput[] = [
          {
            donationId: donation.id,
            beneficiaryType: "USER",
            beneficiaryId: input.receiverId,
            baseUnits: totalUnits,
            publisherBps: BPS_DENOMINATOR - DONATION_PLATFORM_BPS,
            allocatedUnits: receiverUnits,
            usdtMicro: receiverMicro,
          },
        ];
        if (platformUnits > 0) {
          allocations.push({
            donationId: donation.id,
            beneficiaryType: "PLATFORM",
            baseUnits: totalUnits,
            publisherBps: BPS_DENOMINATOR - DONATION_PLATFORM_BPS,
            allocatedUnits: platformUnits,
            usdtMicro: platformMicro,
          });
        }
        await tx.revenueAllocation.createMany({ data: allocations });

        const ledgerRows: LedgerEntryInput[] = [];
        if (receiverMicro > 0) {
          ledgerRows.push({
            account: "BENEFICIARY_PAYABLE",
            ownerType: "USER",
            ownerId: input.receiverId,
            direction: "CREDIT",
            amount: receiverMicro,
            currency: "USDT_MICRO",
            sourceType: "DONATION",
            sourceId: donation.id,
            idempotencyKey: `donation:${donation.id}:receiver`,
          });
        }
        if (platformMicro > 0) {
          ledgerRows.push({
            account: "PLATFORM_REVENUE",
            ownerType: "PLATFORM",
            ownerId: null,
            direction: "CREDIT",
            amount: platformMicro,
            currency: "USDT_MICRO",
            sourceType: "DONATION",
            sourceId: donation.id,
            idempotencyKey: `donation:${donation.id}:platform`,
          });
        }
        await postLedgerEntries(tx, ledgerRows);

        await tx.transaction.create({
          data: {
            type: "DONATION",
            status: "PAID",
            amount: input.coins,
            currency: "COIN",
            payerId: input.donorId,
            receiverId: input.receiverId,
            message,
          },
        });

        return donation.id;
      },
      { timeout: 15_000, maxWait: 5_000 }
    );

    return { success: true, donationId };
  } catch (err) {
    if (err instanceof InsufficientCoinsError) return { success: false, error: "سکه کافی نیست" };
    if (isUniqueViolation(err)) {
      const again = await findReplay(input.donorId, input.idempotencyKey);
      if (again) return again;
    }
    throw err;
  }
}

export async function getReceivedDonationsUsdt(userId: string): Promise<number> {
  const [legacy, coin] = await Promise.all([
    prisma.transaction.aggregate({
      where: { type: "DONATION", status: "PAID", currency: "USDT", receiverId: userId },
      _sum: { amount: true },
    }),
    prisma.donation.aggregate({ where: { receiverId: userId }, _sum: { receiverUsdtMicro: true } }),
  ]);
  const total = Number(legacy._sum.amount ?? 0) + microToUsdt(coin._sum.receiverUsdtMicro ?? 0);
  return Math.round(total * 1e6) / 1e6;
}