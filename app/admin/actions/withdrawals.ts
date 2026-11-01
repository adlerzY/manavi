"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { safeError, type ActionResult } from "@/lib/errors";
import { logAuditEvent } from "@/lib/audit-log";
import { PLATFORM_SETTINGS_TAG } from "@/lib/platform-settings";
import {
  WithdrawalError,
  notifyRequester,
  rejectWithdrawal,
  resolveReceiptUrl,
  resolveWithdrawalDispute,
  searchWithdrawals,
  startWithdrawalReview,
} from "@/lib/withdrawals";
import type { WithdrawalView } from "@/lib/withdrawal-types";

function fail<T = undefined>(err: unknown): ActionResult<T> {
  if (err instanceof WithdrawalError) return { success: false, error: err.message };
  return safeError<T>(err);
}

function refresh() {
  revalidatePath("/admin/payouts");
  revalidatePath("/admin");
  revalidatePath("/app/earnings");
  revalidatePath("/publisher/earnings");
}

export async function listWithdrawalsAdmin(params: {
  status?: string;
  q?: string;
  page?: number;
}): Promise<{ withdrawals: WithdrawalView[]; total: number }> {
  await requireAdmin();
  return searchWithdrawals(params);
}

export async function startWithdrawalReviewAdmin(id: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const request = await startWithdrawalReview(String(id), { id: admin.id, role: admin.role });

    after(() => {
      notifyRequester(request.requesterId, id, "processing", "درخواست تسویه‌حساب شما در حال پرداخت است", request.code).catch(() => {});
      logAuditEvent({ actorId: admin.id, actorRole: admin.role, action: "withdrawal.review", targetType: "WithdrawalRequest", targetId: id });
    });

    refresh();
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

export async function rejectWithdrawalAdmin(id: string, reason: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const result = await rejectWithdrawal({ id: String(id), admin: { id: admin.id, role: admin.role }, reason: String(reason ?? "") });

    after(() => {
      notifyRequester(result.requesterId, id, "rejected", "درخواست تسویه‌حساب شما رد شد", `${result.code} — ${result.reason}`).catch(() => {});
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "withdrawal.reject",
        targetType: "WithdrawalRequest",
        targetId: id,
        metadata: { reason: result.reason },
      });
    });

    refresh();
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

export async function resolveWithdrawalDisputeAdmin(id: string, resolution: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const result = await resolveWithdrawalDispute({ id: String(id), admin: { id: admin.id, role: admin.role }, resolution: String(resolution ?? "") });

    after(() => {
      notifyRequester(result.requesterId, id, "dispute-resolved", "مدیریت به مغایرت شما پاسخ داد", result.code).catch(() => {});
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "withdrawal.resolveDispute",
        targetType: "WithdrawalRequest",
        targetId: id,
      });
    });

    refresh();
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

export async function getWithdrawalReceiptAdmin(id: string): Promise<ActionResult<{ url: string }>> {
  try {
    const admin = await requireAdmin();
    const url = await resolveReceiptUrl(String(id), admin);
    return { success: true, data: { url } };
  } catch (err) {
    return fail(err);
  }
}

export async function updatePayoutSettings(input: { payoutCoinValueToman: number; payoutMinCoins: number }): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const value = Number(input.payoutCoinValueToman);
    const min = Number(input.payoutMinCoins);

    if (!Number.isInteger(value) || value < 0 || value > 100_000_000) {
      return { success: false, error: "ارزش تومانی هر سکه باید عددی صحیح بین ۰ تا ۱۰۰ میلیون باشد" };
    }
    if (!Number.isInteger(min) || min < 1 || min > 10_000_000) {
      return { success: false, error: "حداقل مقدار تسویه باید عددی صحیح و مثبت باشد" };
    }

    await prisma.platformSettings.upsert({
      where: { id: "singleton" },
      update: { payoutCoinValueToman: value, payoutMinCoins: min },
      create: { id: "singleton", payoutCoinValueToman: value, payoutMinCoins: min },
    });

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "payoutSettings.update",
        targetType: "PlatformSettings",
        targetId: "singleton",
        metadata: { payoutCoinValueToman: value, payoutMinCoins: min },
      })
    );

    revalidateTag(PLATFORM_SETTINGS_TAG, "max");
    refresh();
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}