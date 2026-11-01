import "server-only";
import type { Prisma } from "@prisma/client";
import { postLedgerEntries } from "./ledger";

export type EarningsOwnerType = "USER" | "PUBLISHER";

export class InsufficientEarningsError extends Error {
  constructor() {
    super("insufficient earnings");
    this.name = "InsufficientEarningsError";
  }
}

export interface EarningsOwner {
  ownerType: EarningsOwnerType;
  ownerId: string;
}

export interface EarningsCredit extends EarningsOwner {
  units: number;
}

export interface EarningsSource {
  sourceType: string;
  sourceId: string;
}

const ownerKey = (owner: EarningsOwner) => `${owner.ownerType}:${owner.ownerId}`;
const sourceKey = (source: EarningsSource) => `${source.sourceType.toLowerCase()}:${source.sourceId}`;

async function post(
  tx: Prisma.TransactionClient,
  owner: EarningsOwner,
  account: "BENEFICIARY_PAYABLE" | "BENEFICIARY_PAID",
  direction: "CREDIT" | "DEBIT",
  units: bigint,
  source: EarningsSource,
  key: string
): Promise<boolean> {
  const posted = await postLedgerEntries(tx, [
    {
      account,
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      direction,
      amount: units,
      currency: "COIN_UNIT",
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      idempotencyKey: key,
    },
  ]);
  return posted > 0;
}

export async function creditEarnings(
  tx: Prisma.TransactionClient,
  credits: EarningsCredit[],
  source: EarningsSource
): Promise<void> {
  const merged = new Map<string, EarningsCredit>();
  for (const credit of credits) {
    if (!Number.isInteger(credit.units) || credit.units <= 0) continue;
    const key = ownerKey(credit);
    const current = merged.get(key);
    if (current) current.units += credit.units;
    else merged.set(key, { ...credit });
  }

  const ordered = [...merged.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value);
  if (ordered.length === 0) return;

  await tx.earningsAccount.createMany({
    data: ordered.map((credit) => ({ ownerType: credit.ownerType, ownerId: credit.ownerId })),
    skipDuplicates: true,
  });

  for (const credit of ordered) {
    const units = BigInt(credit.units);
    const posted = await post(tx, credit, "BENEFICIARY_PAYABLE", "CREDIT", units, source, `${sourceKey(source)}:earn:${ownerKey(credit)}`);
    if (!posted) continue;
    await tx.earningsAccount.update({
      where: { ownerType_ownerId: { ownerType: credit.ownerType, ownerId: credit.ownerId } },
      data: { balanceUnits: { increment: units }, lifetimeEarnedUnits: { increment: units } },
    });
  }
}

export async function holdEarnings(
  tx: Prisma.TransactionClient,
  owner: EarningsOwner,
  units: bigint,
  source: EarningsSource
): Promise<boolean> {
  if (units <= 0n) throw new Error("invalid earnings amount");
  if (!(await post(tx, owner, "BENEFICIARY_PAYABLE", "DEBIT", units, source, `${sourceKey(source)}:hold`))) return false;

  const updated = await tx.earningsAccount.updateMany({
    where: { ownerType: owner.ownerType, ownerId: owner.ownerId, balanceUnits: { gte: units } },
    data: { balanceUnits: { decrement: units } },
  });
  if (updated.count === 0) throw new InsufficientEarningsError();
  return true;
}

export async function releaseEarnings(
  tx: Prisma.TransactionClient,
  owner: EarningsOwner,
  units: bigint,
  source: EarningsSource
): Promise<boolean> {
  if (units <= 0n) throw new Error("invalid earnings amount");
  if (!(await post(tx, owner, "BENEFICIARY_PAYABLE", "CREDIT", units, source, `${sourceKey(source)}:release`))) return false;

  await tx.earningsAccount.update({
    where: { ownerType_ownerId: { ownerType: owner.ownerType, ownerId: owner.ownerId } },
    data: { balanceUnits: { increment: units } },
  });
  return true;
}

export async function settleEarnings(
  tx: Prisma.TransactionClient,
  owner: EarningsOwner,
  units: bigint,
  source: EarningsSource
): Promise<boolean> {
  if (units <= 0n) throw new Error("invalid earnings amount");
  if (!(await post(tx, owner, "BENEFICIARY_PAID", "CREDIT", units, source, `${sourceKey(source)}:paid`))) return false;

  await tx.earningsAccount.update({
    where: { ownerType_ownerId: { ownerType: owner.ownerType, ownerId: owner.ownerId } },
    data: { lifetimeWithdrawnUnits: { increment: units } },
  });
  return true;
}