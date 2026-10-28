"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { logAuditEvent } from "@/lib/audit-log";
import { isSafeUrl } from "@/lib/profile-links";
import { usdtToMicro } from "@/lib/units";
import { notifyPayoutRecorded } from "@/lib/notifications";
import {
  SettlementError,
  createSettlementPeriodWithLines,
  recalculatePeriod,
  lockPeriod,
  transitionLine,
  setLineNote,
  registerPayout,
} from "@/lib/settlement";
import type { BeneficiaryType, SettlementLineStatus, SettlementPeriodStatus, PayoutConfirmationStatus } from "@prisma/client";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface SettlementPayoutRow {
  id: string;
  amountMicro: number;
  reference: string | null;
  receiptUrl: string | null;
  note: string | null;
  paidAt: string;
  confirmation: { status: PayoutConfirmationStatus; note: string | null } | null;
}

export interface SettlementLineRow {
  id: string;
  beneficiaryType: BeneficiaryType;
  beneficiaryName: string;
  walletAddress: string | null;
  owedMicro: number;
  paidMicro: number;
  status: SettlementLineStatus;
  note: string | null;
  payouts: SettlementPayoutRow[];
}

export interface SettlementPeriodRow {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: SettlementPeriodStatus;
  lockedAt: string | null;
  lines: SettlementLineRow[];
}

function fail<T = undefined>(err: unknown): ActionResult<T> {
  if (err instanceof SettlementError) return { success: false, error: err.message };
  return safeError(err);
}

export async function listSettlementPeriods(): Promise<SettlementPeriodRow[]> {
  await requireAdmin();

  const periods = await prisma.settlementPeriod.findMany({
    orderBy: { periodEnd: "desc" },
    take: 12,
    include: {
      lines: {
        orderBy: { owedMicro: "desc" },
        include: { payouts: { orderBy: { paidAt: "asc" }, include: { confirmation: true } } },
      },
    },
  });

  const userIds = new Set<string>();
  const publisherIds = new Set<string>();
  for (const period of periods) {
    for (const line of period.lines) {
      if (line.beneficiaryType === "USER") userIds.add(line.beneficiaryId);
      else if (line.beneficiaryType === "PUBLISHER") publisherIds.add(line.beneficiaryId);
    }
  }

  const [users, publishers] = await Promise.all([
    userIds.size
      ? prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, firstName: true, username: true, cryptoWalletAddress: true },
        })
      : Promise.resolve([]),
    publisherIds.size
      ? prisma.publisher.findMany({
          where: { id: { in: [...publisherIds] } },
          select: { id: true, name: true, cryptoWalletAddress: true },
        })
      : Promise.resolve([]),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const publisherMap = new Map(publishers.map((p) => [p.id, p]));

  return periods.map((period) => ({
    id: period.id,
    periodStart: period.periodStart.toISOString(),
    periodEnd: period.periodEnd.toISOString(),
    status: period.status,
    lockedAt: period.lockedAt ? period.lockedAt.toISOString() : null,
    lines: period.lines.map((line) => {
      const user = line.beneficiaryType === "USER" ? userMap.get(line.beneficiaryId) : undefined;
      const publisher = line.beneficiaryType === "PUBLISHER" ? publisherMap.get(line.beneficiaryId) : undefined;
      return {
        id: line.id,
        beneficiaryType: line.beneficiaryType,
        beneficiaryName: user ? (user.username ? `@${user.username}` : user.firstName) : publisher?.name ?? "—",
        walletAddress: user?.cryptoWalletAddress ?? publisher?.cryptoWalletAddress ?? null,
        owedMicro: Number(line.owedMicro),
        paidMicro: Number(line.paidMicro),
        status: line.status,
        note: line.note,
        payouts: line.payouts.map((payout) => ({
          id: payout.id,
          amountMicro: Number(payout.amountMicro),
          reference: payout.reference,
          receiptUrl: payout.receiptUrl,
          note: payout.note,
          paidAt: payout.paidAt.toISOString(),
          confirmation: payout.confirmation ? { status: payout.confirmation.status, note: payout.confirmation.note } : null,
        })),
      };
    }),
  }));
}

export async function getUnsettledMicro(): Promise<number> {
  await requireAdmin();
  const result = await prisma.revenueAllocation.aggregate({
    where: { settlementLineId: null, beneficiaryType: { not: "PLATFORM" } },
    _sum: { usdtMicro: true },
  });
  return result._sum.usdtMicro ?? 0;
}

export async function createSettlementPeriod(periodEnd: string): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await requireAdmin();
    const end = new Date(`${periodEnd}T00:00:00.000Z`);
    if (Number.isNaN(end.getTime())) return { success: false, error: "تاریخ نامعتبر است" };
    if (end.getTime() > Date.now()) return { success: false, error: "تاریخ پایان نمی‌تواند در آینده باشد" };

    const id = await createSettlementPeriodWithLines(end);

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "settlement.createPeriod",
        targetType: "SettlementPeriod",
        targetId: id,
        metadata: { periodEnd },
      })
    );
    revalidatePath("/admin/payouts");
    return { success: true, data: { id } };
  } catch (err) {
    return fail(err);
  }
}

export async function recalculateSettlementPeriod(periodId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const lines = await recalculatePeriod(periodId);

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "settlement.recalculate",
        targetType: "SettlementPeriod",
        targetId: periodId,
        metadata: { lines },
      })
    );
    revalidatePath("/admin/payouts");
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

export async function lockSettlementPeriod(periodId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await lockPeriod(periodId, admin.id);

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "settlement.lockPeriod",
        targetType: "SettlementPeriod",
        targetId: periodId,
      })
    );
    revalidatePath("/admin/payouts");
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setSettlementLineStatus(
  lineId: string,
  status: SettlementLineStatus,
  note?: string
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await transitionLine(lineId, status, note);

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "settlement.lineStatus",
        targetType: "SettlementLine",
        targetId: lineId,
        metadata: { status, note: note?.trim() || null },
      })
    );
    revalidatePath("/admin/payouts");
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

export async function addSettlementLineNote(lineId: string, note: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await setLineNote(lineId, note);

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "settlement.note",
        targetType: "SettlementLine",
        targetId: lineId,
      })
    );
    revalidatePath("/admin/payouts");
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

export async function recordSettlementPayout(input: {
  lineId: string;
  amountUsdt: number;
  reference?: string;
  receiptUrl?: string;
  note?: string;
  idempotencyKey: string;
}): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    if (!Number.isFinite(input.amountUsdt) || input.amountUsdt <= 0) {
      return { success: false, error: "مبلغ باید مثبت باشد" };
    }
    const key = input.idempotencyKey.trim().slice(0, 80);
    if (!key) return { success: false, error: "کلید تکرار نامعتبر است" };

    const receiptUrl = input.receiptUrl?.trim() || null;
    if (receiptUrl && !isSafeUrl(receiptUrl)) return { success: false, error: "لینک رسید معتبر نیست" };

    const amountMicro = BigInt(usdtToMicro(input.amountUsdt));

    const result = await registerPayout({
      lineId: input.lineId,
      amountMicro,
      reference: input.reference?.trim().slice(0, 200) || null,
      receiptUrl,
      note: input.note?.trim().slice(0, 500) || null,
      adminId: admin.id,
      idempotencyKey: `${input.lineId}:${key}`,
    });

    if (!result.duplicate) {
      after(() =>
        logAuditEvent({
          actorId: admin.id,
          actorRole: admin.role,
          action: "settlement.payout",
          targetType: "SettlementLine",
          targetId: input.lineId,
          metadata: { payoutId: result.payoutId, amountMicro: amountMicro.toString(), reference: input.reference?.trim() || null },
        })
      );
      after(() =>
        notifyPayoutRecorded({ lineId: input.lineId, amountMicro, payoutId: result.payoutId }).catch(() => {})
      );
    }
    revalidatePath("/admin/payouts");
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}