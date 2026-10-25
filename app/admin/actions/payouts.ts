"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/moderation";
import { safeError } from "@/lib/errors";
import { SettlementError, applyPayoutResponse } from "@/lib/settlement";
import { microToUsdt } from "@/lib/units";
import type { BeneficiaryType, PayoutConfirmationStatus, SettlementLineStatus } from "@prisma/client";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface EarningsPayout {
  id: string;
  amountUsdt: number;
  reference: string | null;
  receiptUrl: string | null;
  note: string | null;
  paidAt: string;
  response: { status: PayoutConfirmationStatus; note: string | null } | null;
}

export interface EarningsLine {
  id: string;
  periodStart: string;
  periodEnd: string;
  beneficiaryType: BeneficiaryType;
  owedUsdt: number;
  paidUsdt: number;
  status: SettlementLineStatus;
  note: string | null;
  payouts: EarningsPayout[];
}

export interface EarningsOverview {
  lines: EarningsLine[];
  accruedUsdt: number;
  outstandingUsdt: number;
  paidUsdt: number;
}

export async function getMyEarnings(): Promise<EarningsOverview | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const beneficiaryFilters = [
    { beneficiaryType: "USER" as const, beneficiaryId: user.id },
    ...(user.publisherProfile
      ? [{ beneficiaryType: "PUBLISHER" as const, beneficiaryId: user.publisherProfile.id }]
      : []),
  ];

  const [lines, accrued] = await Promise.all([
    prisma.settlementLine.findMany({
      where: { OR: beneficiaryFilters, period: { status: "LOCKED" }, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" },
      take: 36,
      select: {
        id: true,
        beneficiaryType: true,
        owedMicro: true,
        paidMicro: true,
        status: true,
        note: true,
        period: { select: { periodStart: true, periodEnd: true } },
        payouts: {
          orderBy: { paidAt: "asc" },
          select: {
            id: true,
            amountMicro: true,
            reference: true,
            receiptUrl: true,
            note: true,
            paidAt: true,
            confirmation: { select: { status: true, note: true } },
          },
        },
      },
    }),
    prisma.revenueAllocation.aggregate({
      where: { OR: beneficiaryFilters, settlementLineId: null },
      _sum: { usdtMicro: true },
    }),
  ]);

  let outstanding = 0;
  let paid = 0;
  const mapped: EarningsLine[] = lines.map((line) => {
    const owed = Number(line.owedMicro);
    const paidMicro = Number(line.paidMicro);
    outstanding += owed - paidMicro;
    paid += paidMicro;
    return {
      id: line.id,
      periodStart: line.period.periodStart.toISOString(),
      periodEnd: line.period.periodEnd.toISOString(),
      beneficiaryType: line.beneficiaryType,
      owedUsdt: microToUsdt(owed),
      paidUsdt: microToUsdt(paidMicro),
      status: line.status,
      note: line.note,
      payouts: line.payouts.map((payout) => ({
        id: payout.id,
        amountUsdt: microToUsdt(payout.amountMicro),
        reference: payout.reference,
        receiptUrl: payout.receiptUrl,
        note: payout.note,
        paidAt: payout.paidAt.toISOString(),
        response: payout.confirmation ? { status: payout.confirmation.status, note: payout.confirmation.note } : null,
      })),
    };
  });

  return {
    lines: mapped,
    accruedUsdt: microToUsdt(accrued._sum.usdtMicro ?? 0),
    outstandingUsdt: microToUsdt(outstanding),
    paidUsdt: microToUsdt(paid),
  };
}

export async function respondToPayout(
  payoutId: string,
  status: "CONFIRMED" | "DISPUTED",
  note?: string
): Promise<ActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { success: false, error: "برای این عملیات باید وارد شوید" };
    if (user.isBanned) return { success: false, error: "حساب شما مسدود شده است" };

    const allowed = await checkRateLimit(`payout-response:${user.id}`, 10);
    if (!allowed) return { success: false, error: "تعداد درخواست‌ها بیش از حد مجاز است" };

    const cleanNote = note?.trim().slice(0, 500) || null;
    if (status === "DISPUTED" && !cleanNote) {
      return { success: false, error: "برای ثبت مغایرت توضیح بنویسید" };
    }

    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
      select: {
        settlementLine: { select: { beneficiaryType: true, beneficiaryId: true } },
        confirmation: { select: { status: true } },
      },
    });
    if (!payout) return { success: false, error: "پرداخت یافت نشد" };

    const line = payout.settlementLine;
    const isRecipient =
      (line.beneficiaryType === "USER" && line.beneficiaryId === user.id) ||
      (line.beneficiaryType === "PUBLISHER" && user.publisherProfile?.id === line.beneficiaryId);
    if (!isRecipient) return { success: false, error: "دسترسی غیرمجاز" };

    if (payout.confirmation?.status === "CONFIRMED") {
      return status === "CONFIRMED" ? { success: true } : { success: false, error: "این پرداخت قبلاً تأیید شده است" };
    }

    await applyPayoutResponse({ payoutId, recipientId: user.id, status, note: cleanNote });

    revalidatePath("/app/earnings");
    revalidatePath("/publisher/earnings");
    revalidatePath("/admin/payouts");
    return { success: true };
  } catch (err) {
    if (err instanceof SettlementError) return { success: false, error: err.message };
    return safeError(err);
  }
}