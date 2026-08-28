import "server-only";
import { prisma } from "./prisma";
import type { Transaction } from "@prisma/client";
import { getReferralRewardCoins } from "./platform-settings";
import { invalidateSessionUserCache } from "./auth";
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

async function grantReferralRewardIfEligible(payerId: string): Promise<void> {
  const rewardCoins = await getReferralRewardCoins();
  if (rewardCoins <= 0) return;

  const payer = await prisma.user.findUnique({
    where: { id: payerId },
    select: { referredById: true, referralRewardGranted: true },
  });
  if (!payer?.referredById || payer.referralRewardGranted) return;

  const claimed = await prisma.user.updateMany({
    where: { id: payerId, referralRewardGranted: false },
    data: { referralRewardGranted: true },
  });
  if (claimed.count === 0) return;

  await prisma.user.update({
    where: { id: payer.referredById },
    data: { coinsBalance: { increment: rewardCoins }, referralCount: { increment: 1 } },
  });
}

async function applySettlementSideEffects(transaction: Transaction): Promise<void> {
  if (transaction.type === "COIN_PURCHASE") {
    let coinsToGrant = 0;
    if (transaction.coinPackageId) {
      const pack = await prisma.coinPackage.findUnique({ where: { id: transaction.coinPackageId } });
      if (pack) coinsToGrant = pack.coins + pack.bonusCoins;
    } else if (transaction.customCoins) {
      coinsToGrant = transaction.customCoins;
    }
    if (coinsToGrant > 0) {
      await prisma.user.update({ where: { id: transaction.payerId }, data: { coinsBalance: { increment: coinsToGrant } } });
      await invalidateSessionUserCache(transaction.payerId);
      await grantReferralRewardIfEligible(transaction.payerId).catch((err) => {
        console.error("[ton-settlement] referral reward grant failed", err);
      });
    }
    return;
  }
  if (transaction.type === "PUBLISHER_PAYOUT") {
    await prisma.payoutRequest.updateMany({
      where: { tonTransactionId: transaction.id },
      data: { status: "PAID", paidAmountTon: transaction.amount, paidAt: new Date() },
    });
  }
}

async function claimAndSettle(transaction: Transaction, txHash: string): Promise<TonSettlementStatus> {
  const claimed = await prisma.transaction.updateMany({
    where: { id: transaction.id, status: "PENDING" },
    data: { status: "PAID", tonTxHash: txHash },
  });
  if (claimed.count === 0) return "PAID";
  await applySettlementSideEffects(transaction);
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
    const toOwnerAddress = await resolveDestinationOwnerAddress(transaction);
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