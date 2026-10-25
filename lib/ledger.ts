import "server-only";
import type { LedgerAccount, LedgerCurrency, LedgerDirection, LedgerOwnerType, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { UNITS_PER_COIN } from "./units";

export class InsufficientCoinsError extends Error {
  constructor(public required: number) {
    super("insufficient coins");
    this.name = "InsufficientCoinsError";
  }
}

export interface LedgerEntryInput {
  account: LedgerAccount;
  ownerType: LedgerOwnerType;
  ownerId: string | null;
  direction: LedgerDirection;
  amount: number | bigint;
  currency: LedgerCurrency;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  note?: string | null;
}

export async function postLedgerEntries(tx: Prisma.TransactionClient, entries: LedgerEntryInput[]): Promise<number> {
  if (entries.length === 0) return 0;
  const result = await tx.ledgerEntry.createMany({
    data: entries.map((entry) => ({
      account: entry.account,
      ownerType: entry.ownerType,
      ownerId: entry.ownerId,
      direction: entry.direction,
      amountUnits: BigInt(entry.amount),
      currency: entry.currency,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      idempotencyKey: entry.idempotencyKey,
      note: entry.note ?? null,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

export interface WalletDeltaInput {
  userId: string;
  coinsDelta: number;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  note?: string | null;
}

export async function applyWalletDelta(tx: Prisma.TransactionClient, input: WalletDeltaInput): Promise<boolean> {
  if (!Number.isInteger(input.coinsDelta) || input.coinsDelta === 0) {
    throw new Error("invalid wallet delta");
  }

  const credit = input.coinsDelta > 0;
  const coins = Math.abs(input.coinsDelta);

  const posted = await postLedgerEntries(tx, [
    {
      account: "USER_COIN_WALLET",
      ownerType: "USER",
      ownerId: input.userId,
      direction: credit ? "CREDIT" : "DEBIT",
      amount: coins * UNITS_PER_COIN,
      currency: "COIN_UNIT",
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      idempotencyKey: input.idempotencyKey,
      note: input.note,
    },
  ]);
  if (posted === 0) return false;

  if (credit) {
    await tx.user.update({ where: { id: input.userId }, data: { coinsBalance: { increment: coins } } });
    return true;
  }

  const debited = await tx.user.updateMany({
    where: { id: input.userId, coinsBalance: { gte: coins } },
    data: { coinsBalance: { decrement: coins } },
  });
  if (debited.count === 0) throw new InsufficientCoinsError(coins);
  return true;
}

export interface WalletMismatch {
  userId: string;
  balanceUnits: number;
  ledgerUnits: number;
}

export async function findWalletMismatches(limit = 100): Promise<WalletMismatch[]> {
  const rows = await prisma.$queryRaw<{ id: string; balance: bigint; ledger: bigint }[]>`
    SELECT u."id",
           (u."coinsBalance" * ${UNITS_PER_COIN}::int)::bigint AS balance,
           COALESCE(SUM(CASE WHEN l."direction" = 'CREDIT' THEN l."amountUnits" ELSE -l."amountUnits" END), 0)::bigint AS ledger
    FROM "User" u
    LEFT JOIN "LedgerEntry" l ON l."ownerId" = u."id" AND l."account" = 'USER_COIN_WALLET'
    GROUP BY u."id", u."coinsBalance"
    HAVING COALESCE(SUM(CASE WHEN l."direction" = 'CREDIT' THEN l."amountUnits" ELSE -l."amountUnits" END), 0) <> (u."coinsBalance" * ${UNITS_PER_COIN}::int)::bigint
    LIMIT ${limit}`;
  return rows.map((row) => ({ userId: row.id, balanceUnits: Number(row.balance), ledgerUnits: Number(row.ledger) }));
}

export async function findAllocationDiscrepancies(limit = 100): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT sl."id"
    FROM "SaleLine" sl
    LEFT JOIN "RevenueAllocation" ra ON ra."saleLineId" = sl."id"
    GROUP BY sl."id", sl."unitsAmount"
    HAVING COALESCE(SUM(ra."allocatedUnits"), 0) <> sl."unitsAmount"
    LIMIT ${limit}`;
  return rows.map((row) => row.id);
}