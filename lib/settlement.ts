import "server-only";
import { randomUUID } from "crypto";
import type { LedgerOwnerType, Prisma, SettlementLineStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { postLedgerEntries } from "./ledger";

export class SettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementError";
  }
}

class DuplicatePayoutError extends Error {}

const TRANSACTION_OPTIONS = { timeout: 30_000, maxWait: 5_000 };

const TRANSITIONS: Partial<Record<SettlementLineStatus, SettlementLineStatus[]>> = {
  CALCULATED: ["APPROVED_FOR_PAYMENT", "ON_HOLD", "CANCELLED"],
  APPROVED_FOR_PAYMENT: ["ON_HOLD", "CANCELLED"],
  ON_HOLD: ["APPROVED_FOR_PAYMENT", "CANCELLED"],
  PARTIALLY_PAID: ["ON_HOLD"],
};

const PAYABLE_STATUSES: SettlementLineStatus[] = ["APPROVED_FOR_PAYMENT", "PARTIALLY_PAID"];

export async function calculatePeriodLines(tx: Prisma.TransactionClient, periodId: string): Promise<number> {
  const period = await tx.settlementPeriod.findUniqueOrThrow({ where: { id: periodId } });
  if (period.status !== "OPEN") throw new SettlementError("این دوره قفل شده است");

  await tx.revenueAllocation.updateMany({
    where: { settlementLine: { periodId } },
    data: { settlementLineId: null },
  });
  await tx.settlementLine.deleteMany({ where: { periodId } });

  const groups = await tx.revenueAllocation.groupBy({
    by: ["beneficiaryType", "beneficiaryId"],
    where: {
      settlementLineId: null,
      beneficiaryType: { not: "PLATFORM" },
      beneficiaryId: { not: null },
      createdAt: { lt: period.periodEnd },
    },
    _sum: { usdtMicro: true },
  });

  let created = 0;
  for (const group of groups) {
    const total = group._sum.usdtMicro ?? 0;
    if (total <= 0 || !group.beneficiaryId) continue;

    const line = await tx.settlementLine.create({
      data: {
        periodId,
        beneficiaryType: group.beneficiaryType,
        beneficiaryId: group.beneficiaryId,
        owedMicro: BigInt(total),
      },
      select: { id: true },
    });

    await tx.revenueAllocation.updateMany({
      where: {
        settlementLineId: null,
        beneficiaryType: group.beneficiaryType,
        beneficiaryId: group.beneficiaryId,
        createdAt: { lt: period.periodEnd },
      },
      data: { settlementLineId: line.id },
    });
    created += 1;
  }

  return created;
}

export async function createSettlementPeriodWithLines(periodEnd: Date): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const last = await tx.settlementPeriod.findFirst({ orderBy: { periodEnd: "desc" } });
    if (last && last.status === "OPEN") throw new SettlementError("ابتدا دوره‌ی باز قبلی را قفل کنید");
    if (last && periodEnd <= last.periodEnd) {
      throw new SettlementError("تاریخ پایان باید بعد از پایان آخرین دوره باشد");
    }

    let periodStart = last?.periodEnd;
    if (!periodStart) {
      const earliest = await tx.revenueAllocation.findFirst({
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });
      periodStart = earliest && earliest.createdAt < periodEnd ? earliest.createdAt : periodEnd;
    }

    const period = await tx.settlementPeriod.create({ data: { periodStart, periodEnd }, select: { id: true } });
    await calculatePeriodLines(tx, period.id);
    return period.id;
  }, TRANSACTION_OPTIONS);
}

export async function recalculatePeriod(periodId: string): Promise<number> {
  return prisma.$transaction((tx) => calculatePeriodLines(tx, periodId), TRANSACTION_OPTIONS);
}

export async function lockPeriod(periodId: string, adminId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const period = await tx.settlementPeriod.findUniqueOrThrow({ where: { id: periodId } });
    if (period.status !== "OPEN") throw new SettlementError("این دوره قبلاً قفل شده است");
    if (period.periodEnd.getTime() > Date.now()) throw new SettlementError("پایان دوره هنوز نرسیده است");

    await calculatePeriodLines(tx, periodId);
    await tx.settlementPeriod.update({
      where: { id: periodId },
      data: { status: "LOCKED", lockedAt: new Date(), lockedById: adminId },
    });
  }, TRANSACTION_OPTIONS);
}

export async function recomputeLineStatus(tx: Prisma.TransactionClient, lineId: string): Promise<void> {
  const line = await tx.settlementLine.findUniqueOrThrow({
    where: { id: lineId },
    select: {
      status: true,
      owedMicro: true,
      paidMicro: true,
      payouts: { select: { confirmation: { select: { status: true } } } },
    },
  });

  if (line.payouts.length === 0) return;
  if (line.status === "CANCELLED" || line.status === "ON_HOLD") return;

  const disputed = line.payouts.some((payout) => payout.confirmation?.status === "DISPUTED");
  const fullyPaid = line.paidMicro >= line.owedMicro;
  const allConfirmed = line.payouts.every((payout) => payout.confirmation?.status === "CONFIRMED");

  let next: SettlementLineStatus;
  if (disputed) next = "DISPUTED";
  else if (!fullyPaid) next = "PARTIALLY_PAID";
  else if (allConfirmed) next = "CONFIRMED_BY_RECIPIENT";
  else next = "PAID_BY_ADMIN";

  if (next !== line.status) {
    await tx.settlementLine.update({ where: { id: lineId }, data: { status: next } });
  }
}

export async function transitionLine(lineId: string, requested: SettlementLineStatus, note?: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const line = await tx.settlementLine.findUnique({
      where: { id: lineId },
      select: { id: true, status: true, paidMicro: true, period: { select: { status: true } } },
    });
    if (!line) throw new SettlementError("ردیف تسویه یافت نشد");
    if (line.period.status !== "LOCKED") throw new SettlementError("دوره هنوز قفل نشده است");

    const allowed = TRANSITIONS[line.status] ?? [];
    if (!allowed.includes(requested)) throw new SettlementError("این تغییر وضعیت مجاز نیست");

    const cleanNote = note?.trim().slice(0, 500) || null;
    let next = requested;

    if (requested === "CANCELLED") {
      if (line.paidMicro > 0n) throw new SettlementError("ردیف دارای پرداخت قابل لغو نیست");
      if (!cleanNote) throw new SettlementError("دلیل لغو الزامی است");
      await tx.revenueAllocation.updateMany({ where: { settlementLineId: lineId }, data: { settlementLineId: null } });
    }
    if (requested === "APPROVED_FOR_PAYMENT" && line.paidMicro > 0n) {
      next = "PARTIALLY_PAID";
    }

    const updated = await tx.settlementLine.updateMany({
      where: { id: lineId, status: line.status },
      data: { status: next, ...(cleanNote ? { note: cleanNote } : {}) },
    });
    if (updated.count === 0) throw new SettlementError("وضعیت تغییر کرده است — دوباره تلاش کنید");
  }, TRANSACTION_OPTIONS);
}

export async function setLineNote(lineId: string, note: string): Promise<void> {
  const clean = note.trim().slice(0, 500);
  if (!clean) throw new SettlementError("متن یادداشت خالی است");
  const result = await prisma.settlementLine.updateMany({ where: { id: lineId }, data: { note: clean } });
  if (result.count === 0) throw new SettlementError("ردیف تسویه یافت نشد");
}

export interface RegisterPayoutInput {
  lineId: string;
  amountMicro: bigint;
  reference: string | null;
  receiptUrl: string | null;
  note: string | null;
  adminId: string;
  idempotencyKey: string;
}

export async function registerPayout(input: RegisterPayoutInput): Promise<{ payoutId: string | null; duplicate: boolean }> {
  try {
    const payoutId = await prisma.$transaction(async (tx) => {
      const line = await tx.settlementLine.findUnique({
        where: { id: input.lineId },
        select: {
          id: true,
          beneficiaryType: true,
          beneficiaryId: true,
          owedMicro: true,
          paidMicro: true,
          status: true,
          period: { select: { status: true } },
        },
      });
      if (!line) throw new SettlementError("ردیف تسویه یافت نشد");
      if (line.period.status !== "LOCKED") throw new SettlementError("دوره هنوز قفل نشده است");
      if (!PAYABLE_STATUSES.includes(line.status)) throw new SettlementError("این ردیف در وضعیت قابل پرداخت نیست");
      if (input.amountMicro <= 0n) throw new SettlementError("مبلغ باید مثبت باشد");
      if (input.amountMicro > line.owedMicro - line.paidMicro) throw new SettlementError("مبلغ از باقی‌مانده بیشتر است");

      const payoutId = randomUUID();
      const ownerType: LedgerOwnerType = line.beneficiaryType === "PUBLISHER" ? "PUBLISHER" : "USER";

      const posted = await postLedgerEntries(tx, [
        {
          account: "BENEFICIARY_PAYABLE",
          ownerType,
          ownerId: line.beneficiaryId,
          direction: "DEBIT",
          amount: input.amountMicro,
          currency: "USDT_MICRO",
          sourceType: "PAYOUT",
          sourceId: payoutId,
          idempotencyKey: `payout:${input.idempotencyKey}:payable`,
        },
        {
          account: "BENEFICIARY_PAID",
          ownerType,
          ownerId: line.beneficiaryId,
          direction: "CREDIT",
          amount: input.amountMicro,
          currency: "USDT_MICRO",
          sourceType: "PAYOUT",
          sourceId: payoutId,
          idempotencyKey: `payout:${input.idempotencyKey}:paid`,
        },
      ]);
      if (posted !== 2) throw new DuplicatePayoutError();

      const updated = await tx.settlementLine.updateMany({
        where: {
          id: line.id,
          status: { in: PAYABLE_STATUSES },
          paidMicro: { lte: line.owedMicro - input.amountMicro },
        },
        data: { paidMicro: { increment: input.amountMicro } },
      });
      if (updated.count === 0) throw new SettlementError("مبلغ پرداخت‌شده تغییر کرده است — دوباره تلاش کنید");

      await tx.payout.create({
        data: {
          id: payoutId,
          settlementLineId: line.id,
          amountMicro: input.amountMicro,
          reference: input.reference,
          receiptUrl: input.receiptUrl,
          note: input.note,
          paidById: input.adminId,
        },
      });

      await recomputeLineStatus(tx, line.id);
      return payoutId;
    }, TRANSACTION_OPTIONS);

    return { payoutId, duplicate: false };
  } catch (err) {
    if (err instanceof DuplicatePayoutError) return { payoutId: null, duplicate: true };
    throw err;
  }
}

export async function applyPayoutResponse(input: {
  payoutId: string;
  recipientId: string;
  status: "CONFIRMED" | "DISPUTED";
  note: string | null;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({
      where: { id: input.payoutId },
      select: { settlementLineId: true, confirmation: { select: { status: true } } },
    });
    if (!payout) throw new SettlementError("پرداخت یافت نشد");
    if (payout.confirmation?.status === "CONFIRMED") throw new SettlementError("این پرداخت قبلاً تأیید شده است");

    await tx.payoutConfirmation.upsert({
      where: { payoutId: input.payoutId },
      update: { status: input.status, note: input.note, recipientId: input.recipientId },
      create: { payoutId: input.payoutId, recipientId: input.recipientId, status: input.status, note: input.note },
    });

    await recomputeLineStatus(tx, payout.settlementLineId);
  }, TRANSACTION_OPTIONS);
}