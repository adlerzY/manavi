"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { tehranDateRange } from "@/lib/date-range";
import { cleanupOldFailedTransactions as cleanupOldFailedTransactionsLib } from "@/lib/transaction-cleanup";
import type { Prisma, TransactionType, TransactionStatus } from "@prisma/client";

export interface TransactionRow {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  currency: string;
  createdAt: string;
  payer: { firstName: string; username: string | null };
  receiver: { firstName: string; username: string | null } | null;
}

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

function userMatch(q: string): Prisma.UserWhereInput {
  return {
    OR: [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { username: { contains: q, mode: "insensitive" } },
    ],
  };
}

export async function searchTransactions(query: {
  type?: TransactionType;
  status?: TransactionStatus;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ transactions: TransactionRow[]; total: number }> {
  await requireAdmin();

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const q = query.q?.trim().slice(0, 100);
  const range = tehranDateRange(query.from, query.to);

  const where: Prisma.TransactionWhereInput = {
    type: query.type,
    status: query.status,
    ...(range ? { createdAt: range } : {}),
    ...(q ? { OR: [{ payer: userMatch(q) }, { receiver: userMatch(q) }] } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        type: true,
        status: true,
        amount: true,
        currency: true,
        createdAt: true,
        payer: { select: { firstName: true, username: true } },
        receiver: { select: { firstName: true, username: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    transactions: rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      createdAt: r.createdAt.toISOString(),
    })),
    total,
  };
}

export async function cleanupOldFailedTransactions(
  days: number
): Promise<ActionResult<{ deleted: number }>> {
  try {
    await requireAdmin();
    if (!Number.isFinite(days) || days <= 0) {
      return { success: false, error: "تعداد روز باید عددی مثبت باشد" };
    }

    const deleted = await cleanupOldFailedTransactionsLib(days);

    revalidatePath("/admin/transactions");
    return { success: true, data: { deleted } };
  } catch (err) {
    return safeError(err);
  }
}