"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/moderation";
import { safeError, type ActionResult } from "@/lib/errors";
import { notifyAdmins } from "@/lib/notifications";
import {
  WithdrawalError,
  cancelWithdrawal,
  createWithdrawal,
  loadEarningsLedger,
  resolveReceiptUrl,
  respondToWithdrawal,
} from "@/lib/withdrawals";
import { isValidCardNumber, isValidIban, normalizeCardNumber, normalizeIban } from "@/lib/card";
import { MAX_PAYOUT_CARDS, type LedgerRowView } from "@/lib/withdrawal-types";

function fail<T = undefined>(err: unknown): ActionResult<T> {
  if (err instanceof WithdrawalError) return { success: false, error: err.message };
  return safeError<T>(err);
}

async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new WithdrawalError("برای این عملیات باید وارد شوید");
  if (user.isBanned || user.deletedAt) throw new WithdrawalError("حساب شما مسدود شده است");
  return user;
}

function refresh() {
  revalidatePath("/app/earnings");
  revalidatePath("/publisher/earnings");
  revalidatePath("/publisher");
  revalidatePath("/admin/payouts");
  revalidatePath("/admin");
}

export async function requestWithdrawal(input: {
  ownerType: "USER" | "PUBLISHER";
  coins: number | null;
  cardId: string;
  note?: string;
  idempotencyKey: string;
}): Promise<ActionResult<{ code: string }>> {
  try {
    const user = await requireUser();
    if (input.ownerType !== "USER" && input.ownerType !== "PUBLISHER") throw new WithdrawalError("نوع حساب نامعتبر است");

    const coins = input.coins === null ? null : Number(input.coins);
    if (coins !== null && (!Number.isInteger(coins) || coins <= 0)) {
      throw new WithdrawalError("مقدار سکه باید عددی صحیح و مثبت باشد");
    }

    const allowed = await checkRateLimit(`withdrawal:${user.id}`, 5, { failClosed: true });
    if (!allowed) throw new WithdrawalError("تعداد درخواست‌ها بیش از حد مجاز است، کمی صبر کنید");

    const key = `${user.id}:${(input.idempotencyKey?.trim() || randomUUID()).slice(0, 80)}`;
    const result = await createWithdrawal({
      requester: user,
      ownerType: input.ownerType,
      coins,
      cardId: String(input.cardId ?? ""),
      note: input.note,
      idempotencyKey: key,
    });

    if (!result.duplicate) {
      const requesterName = user.username ? `@${user.username}` : user.firstName;
      after(() =>
        notifyAdmins({
          type: "SYSTEM",
          title: "درخواست تسویه‌حساب جدید",
          body: `${result.code} — ${requesterName} — ${result.coins.toLocaleString("fa-IR")} سکه`,
          href: "/admin/payouts",
          dedupeKey: `withdrawal:${result.id}:new`,
        }).catch(() => {})
      );
    }

    refresh();
    return { success: true, data: { code: result.code } };
  } catch (err) {
    return fail(err);
  }
}

export async function cancelMyWithdrawal(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await cancelWithdrawal(String(id), { id: user.id, role: user.role });
    refresh();
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

export async function respondToMyWithdrawal(id: string, status: "CONFIRMED" | "DISPUTED", note?: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (status !== "CONFIRMED" && status !== "DISPUTED") throw new WithdrawalError("پاسخ نامعتبر است");

    const allowed = await checkRateLimit(`withdrawal-response:${user.id}`, 10);
    if (!allowed) throw new WithdrawalError("تعداد درخواست‌ها بیش از حد مجاز است");

    const result = await respondToWithdrawal({ id: String(id), actor: { id: user.id, role: user.role }, status, note });

    if (status === "DISPUTED") {
      const text = note?.trim().slice(0, 120) ?? null;
      after(() =>
        notifyAdmins({
          type: "SYSTEM",
          title: "مغایرت در یک تسویه‌حساب ثبت شد",
          body: `${result.code}${text ? ` — ${text}` : ""}`,
          href: "/admin/payouts",
          dedupeKey: `withdrawal:${id}:disputed`,
        }).catch(() => {})
      );
    }

    refresh();
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

export async function getMyWithdrawalReceipt(id: string): Promise<ActionResult<{ url: string }>> {
  try {
    const user = await requireUser();
    const url = await resolveReceiptUrl(String(id), user);
    return { success: true, data: { url } };
  } catch (err) {
    return fail(err);
  }
}

export async function getMyEarningsLedger(
  ownerType: "USER" | "PUBLISHER",
  page: number
): Promise<ActionResult<{ entries: LedgerRowView[]; total: number }>> {
  try {
    const user = await requireUser();
    if (ownerType !== "USER" && ownerType !== "PUBLISHER") throw new WithdrawalError("نوع حساب نامعتبر است");
    const ownerId = ownerType === "USER" ? user.id : user.publisherProfile?.id ?? null;
    if (!ownerId) throw new WithdrawalError("دسترسی به این حساب را ندارید");

    const data = await loadEarningsLedger({ ownerType, ownerId }, Math.max(1, Math.floor(Number(page) || 1)));
    return { success: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function saveMyCard(input: {
  holderName: string;
  cardNumber: string;
  iban?: string;
  makeDefault?: boolean;
}): Promise<ActionResult> {
  try {
    const user = await requireUser();

    const allowed = await checkRateLimit(`payout-card:${user.id}`, 10);
    if (!allowed) throw new WithdrawalError("تعداد درخواست‌ها بیش از حد مجاز است");

    const holderName = String(input.holderName ?? "").trim().replace(/\s+/g, " ");
    if (holderName.length < 3 || holderName.length > 60) throw new WithdrawalError("نام صاحب کارت باید بین ۳ تا ۶۰ کاراکتر باشد");

    const cardNumber = normalizeCardNumber(String(input.cardNumber ?? ""));
    if (!isValidCardNumber(cardNumber)) throw new WithdrawalError("شماره کارت معتبر نیست");

    const rawIban = String(input.iban ?? "").trim();
    const iban = rawIban ? normalizeIban(rawIban) : null;
    if (iban && !isValidIban(iban)) throw new WithdrawalError("شماره شبا معتبر نیست");

    const count = await prisma.payoutCard.count({ where: { userId: user.id } });
    if (count >= MAX_PAYOUT_CARDS) {
      throw new WithdrawalError(`حداکثر ${MAX_PAYOUT_CARDS.toLocaleString("fa-IR")} کارت می‌توانید ثبت کنید؛ ابتدا یکی را حذف کنید`);
    }

    const makeDefault = Boolean(input.makeDefault) || count === 0;
    await prisma.$transaction(async (tx) => {
      if (makeDefault) await tx.payoutCard.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      await tx.payoutCard.create({ data: { userId: user.id, holderName, cardNumber, iban, isDefault: makeDefault } });
    });

    refresh();
    return { success: true };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      return { success: false, error: "این کارت قبلاً ثبت شده است" };
    }
    return fail(err);
  }
}

export async function deleteMyCard(cardId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const card = await prisma.payoutCard.findFirst({ where: { id: String(cardId), userId: user.id }, select: { id: true, isDefault: true } });
    if (!card) throw new WithdrawalError("کارت یافت نشد");

    await prisma.$transaction(async (tx) => {
      await tx.payoutCard.delete({ where: { id: card.id } });
      if (card.isDefault) {
        const next = await tx.payoutCard.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true } });
        if (next) await tx.payoutCard.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });

    refresh();
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setDefaultCard(cardId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const card = await prisma.payoutCard.findFirst({ where: { id: String(cardId), userId: user.id }, select: { id: true } });
    if (!card) throw new WithdrawalError("کارت یافت نشد");

    await prisma.$transaction([
      prisma.payoutCard.updateMany({ where: { userId: user.id }, data: { isDefault: false } }),
      prisma.payoutCard.update({ where: { id: card.id }, data: { isDefault: true } }),
    ]);

    refresh();
    return { success: true };
  } catch (err) {
    return fail(err);
  }
}