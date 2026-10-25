import "server-only";
import { prisma } from "./prisma";
import type { Prisma, Transaction } from "@prisma/client";
import { getReferralRewardCoins } from "./platform-settings";
import { invalidateSessionUserCache } from "./auth";
import { applyWalletDelta } from "./ledger";
import {
  getPlatformTonAddress,
  getJettonWalletAddress,
  usdtToJettonUnits,
  fetchAccountTransactions,
  matchIncomingJettonPayment,
  TonVerificationError,
} from "./ton";

export type TonSettlementStatus = "PAID" | "PENDING" | "FAILED" | "SKIPPED";

async function resolveDestinationOwnerAddress(transaction: Transaction): Promise<string | null> {
  if (transaction.type === "DONATION") {
    const receiver = transaction.receiverId
      ? await prisma.user.findUnique({ where: { id: transaction.receiverId }, select: { cryptoWalletAddress: true } })
      : null;
    return receiver?.cryptoWalletAddress ?? null;
  }
  if (transaction.type === "PUBLISHER_PAYOUT") {
    const publisher = transaction.payoutPublisherId
      ? await prisma.publisher.findUnique({ where: { id: transaction.payoutPublisherId }, select: { cryptoWalletAddress: true } })
      : null;
    return publisher?.cryptoWalletAddress ?? null;
  }
  return getPlatformTonAddress();
}

async function grantReferralReward(
  tx: Prisma.TransactionClient,
  payerId: string,
  rewardCoins: number
): Promise<string | null> {
  if (rewardCoins <= 0) return null;

  const payer = await tx.user.findUnique({
    where: { id: payerId },
    select: { referredById: true, referralRewardGranted: true },
  });
  if (!payer?.referredById || payer.referralRewardGranted) return null;

  const claimed = await tx.user.updateMany({
    where: { id: payerId, referralRewardGranted: false },
    data: { referralRewardGranted: true },
  });
  if (claimed.count === 0) return null;

  await tx.user.update({ where: { id: payer.referredById }, data: { referralCount: { increment: 1 } } });
  await applyWalletDelta(tx, {
    userId: payer.referredById,
    coinsDelta: rewardCoins,
    sourceType: "REFERRAL_REWARD",
    sourceId: payerId,
    idempotencyKey: `referral:${payerId}`,
  });
  return payer.referredById;
}

async function applySettlementSideEffects(
  tx: Prisma.TransactionClient,
  transaction: Transaction,
  referralRewardCoins: number
): Promise<string[]> {
  const touched: string[] = [];

  if (transaction.type === "COIN_PURCHASE") {
    let paidCoins = 0;
    let bonusCoins = 0;
    if (transaction.coinPackageId) {
      const pack = await tx.coinPackage.findUnique({ where: { id: transaction.coinPackageId } });
      if (pack) {
        paidCoins = pack.coins;
        bonusCoins = pack.bonusCoins;
      }
    } else if (transaction.customCoins) {
      paidCoins = transaction.customCoins;
    }

    if (paidCoins > 0) {
      await applyWalletDelta(tx, {
        userId: transaction.payerId,
        coinsDelta: paidCoins,
        sourceType: "COIN_PURCHASE",
        sourceId: transaction.id,
        idempotencyKey: `coin-purchase:${transaction.id}`,
      });
      touched.push(transaction.payerId);
    }
    if (bonusCoins > 0) {
      await applyWalletDelta(tx, {
        userId: transaction.payerId,
        coinsDelta: bonusCoins,
        sourceType: "COIN_BONUS",
        sourceId: transaction.id,
        idempotencyKey: `coin-bonus:${transaction.id}`,
      });
      if (!touched.includes(transaction.payerId)) touched.push(transaction.payerId);
    }
    if (paidCoins + bonusCoins > 0) {
      const referrerId = await grantReferralReward(tx, transaction.payerId, referralRewardCoins);
      if (referrerId) touched.push(referrerId);
    }
    return touched;
  }

  if (transaction.type === "PUBLISHER_PAYOUT") {
    await tx.payoutRequest.updateMany({
      where: { tonTransactionId: transaction.id },
      data: { status: "PAID", paidAmountTon: transaction.amount, paidAt: new Date() },
    });
  }

  return touched;
}

async function claimAndSettle(transaction: Transaction, txHash: string): Promise<TonSettlementStatus> {
  const referralRewardCoins = transaction.type === "COIN_PURCHASE" ? await getReferralRewardCoins() : 0;

  const touchedUserIds = await prisma.$transaction(
    async (tx) => {
      const claimed = await tx.transaction.updateMany({
        where: { id: transaction.id, status: "PENDING" },
        data: { status: "PAID", tonTxHash: txHash },
      });
      if (claimed.count === 0) return null;
      return applySettlementSideEffects(tx, transaction, referralRewardCoins);
    },
    { timeout: 15_000, maxWait: 5_000 }
  );

  if (touchedUserIds) {
    await Promise.all(touchedUserIds.map((userId) => invalidateSessionUserCache(userId)));
  }
  return "PAID";
}

export async function settlePendingTonTransaction(transaction: Transaction): Promise<TonSettlementStatus> {
  if (transaction.status === "PAID") return "PAID";
  if (transaction.status === "FAILED") return "FAILED";
  if (!transaction.tonComment) return "SKIPPED";

  const toOwnerAddress = await resolveDestinationOwnerAddress(transaction);
  if (!toOwnerAddress) return "SKIPPED";

  let fromJettonWalletAddress: string;
  try {
    fromJettonWalletAddress = await getJettonWalletAddress(toOwnerAddress);
  } catch (err) {
    if (err instanceof TonVerificationError) return "PENDING";
    throw err;
  }

  let transactions;
  try {
    transactions = await fetchAccountTransactions(toOwnerAddress);
  } catch (err) {
    if (err instanceof TonVerificationError) return "PENDING";
    throw err;
  }

  const found = matchIncomingJettonPayment(transactions, {
    comment: transaction.tonComment,
    minAmountUnits: usdtToJettonUnits(Number(transaction.amount)),
    afterUnixTime: Math.floor(transaction.createdAt.getTime() / 1000) - 60,
    fromJettonWalletAddress,
  });

  if (!found) return "PENDING";
  return claimAndSettle(transaction, found.hash);
}

export async function settlePendingTonTransactions(
  transactions: Transaction[]
): Promise<{ settled: number; checked: number }> {
  const byOwner = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    if (transaction.status !== "PENDING" || !transaction.tonComment) continue;
    let toOwnerAddress: string | null;
    try {
      toOwnerAddress = await resolveDestinationOwnerAddress(transaction);
    } catch (err) {
      console.error("[ton-settlement] failed to resolve destination address", transaction.id, err);
      continue;
    }
    if (!toOwnerAddress) continue;
    const bucket = byOwner.get(toOwnerAddress) ?? [];
    bucket.push(transaction);
    byOwner.set(toOwnerAddress, bucket);
  }

  let settled = 0;
  let checked = 0;

  for (const [toOwnerAddress, group] of byOwner) {
    let fromJettonWalletAddress: string;
    try {
      fromJettonWalletAddress = await getJettonWalletAddress(toOwnerAddress);
    } catch {
      continue;
    }

    let chainTransactions;
    try {
      chainTransactions = await fetchAccountTransactions(toOwnerAddress);
    } catch {
      continue;
    }

    for (const transaction of group) {
      checked += 1;
      const found = matchIncomingJettonPayment(chainTransactions, {
        comment: transaction.tonComment as string,
        minAmountUnits: usdtToJettonUnits(Number(transaction.amount)),
        afterUnixTime: Math.floor(transaction.createdAt.getTime() / 1000) - 60,
        fromJettonWalletAddress,
      });
      if (!found) continue;
      try {
        const status = await claimAndSettle(transaction, found.hash);
        if (status === "PAID") settled += 1;
      } catch (err) {
        console.error("[ton-settlement] failed to settle transaction", transaction.id, err);
      }
    }
  }

  return { settled, checked };
}

const STALE_PENDING_HOURS = 48;

export async function failStalePendingTonTransactions(): Promise<{ failed: number }> {
  const cutoff = new Date(Date.now() - STALE_PENDING_HOURS * 60 * 60 * 1000);

  const stale = await prisma.transaction.findMany({
    where: { status: "PENDING", currency: "USDT", tonComment: { not: null }, createdAt: { lt: cutoff } },
    select: { id: true },
  });

  if (stale.length === 0) return { failed: 0 };

  const staleIds = stale.map((t) => t.id);

  await prisma.$transaction([
    prisma.transaction.updateMany({ where: { id: { in: staleIds } }, data: { status: "FAILED" } }),
    prisma.payoutRequest.updateMany({
      where: { tonTransactionId: { in: staleIds }, status: "PENDING" },
      data: { tonTransactionId: null },
    }),
  ]);

  return { failed: staleIds.length };
}