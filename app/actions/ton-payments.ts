"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { checkRateLimit } from "@/lib/moderation";
import {
  isTonConfigured,
  getPlatformTonAddress,
  getJettonWalletAddress,
  usdtToJettonUnits,
  buildJettonTransferPayload,
  generateTonComment,
  JETTON_TRANSFER_GAS_NANOTON,
  TonVerificationError,
} from "@/lib/ton";
import { settlePendingTonTransaction } from "@/lib/ton-settlement";
import { findActiveCoinPackage } from "@/lib/coin-packages";
import { getChapterUnlockCoinCost, getCoinPriceUsdt } from "@/lib/platform-settings";
import { MIN_DONATION_USDT, MAX_DONATION_USDT, MAX_CUSTOM_COINS } from "@/lib/billing";
import { safeError } from "@/lib/errors";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface TonPaymentRequest {
  transactionId: string;
  jettonWalletAddress: string;
  amountNanotons: string;
  payloadBase64: string;
}

async function createPendingTransaction(input: {
  type: "COIN_PURCHASE" | "DONATION" | "PUBLISHER_PAYOUT";
  amountUsdt: number;
  payerId: string;
  receiverId?: string;
  message?: string;
  coinPackageId?: string;
  customCoins?: number;
  payoutPublisherId?: string;
}) {
  const transaction = await prisma.transaction.create({
    data: {
      type: input.type,
      status: "PENDING",
      amount: input.amountUsdt,
      currency: "USDT",
      payerId: input.payerId,
      receiverId: input.receiverId,
      message: input.message,
      coinPackageId: input.coinPackageId,
      customCoins: input.customCoins,
      payoutPublisherId: input.payoutPublisherId,
    },
  });
  const comment = generateTonComment(transaction.id);
  await prisma.transaction.update({ where: { id: transaction.id }, data: { tonComment: comment } });
  return { transaction, comment };
}

function buildPaymentPayload(input: {
  jettonWalletAddress: string;
  payerWalletAddress: string;
  destinationOwnerAddress: string;
  amountUsdt: number;
  comment: string;
  transactionId: string;
}): TonPaymentRequest {
  const payloadBase64 = buildJettonTransferPayload({
    jettonAmountUnits: usdtToJettonUnits(input.amountUsdt),
    toOwnerAddress: input.destinationOwnerAddress,
    responseAddress: input.payerWalletAddress,
    comment: input.comment,
  });
  return {
    transactionId: input.transactionId,
    jettonWalletAddress: input.jettonWalletAddress,
    amountNanotons: JETTON_TRANSFER_GAS_NANOTON.toString(),
    payloadBase64,
  };
}

function handlePaymentError<T>(err: unknown): ActionResult<T> {
  if (err instanceof TonVerificationError) return { success: false, error: err.message };
  return safeError(err);
}

export async function createTonCoinPayment(packageId: string, payerWalletAddress: string): Promise<ActionResult<TonPaymentRequest>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: "برای خرید باید وارد شوید" };
  if (user.isBanned) return { success: false, error: "حساب شما مسدود شده است" };
  if (!isTonConfigured()) return { success: false, error: "پرداخت هنوز پیکربندی نشده است" };

  const allowed = await checkRateLimit(`usdt-coins:${user.id}`, 5);
  if (!allowed) return { success: false, error: "تعداد درخواست‌ها بیش از حد مجاز است، کمی صبر کنید" };

  const pack = await findActiveCoinPackage(packageId);
  if (!pack) return { success: false, error: "این پکیج در دسترس نیست" };

  try {
    const jettonWalletAddress = await getJettonWalletAddress(payerWalletAddress);
    const { transaction, comment } = await createPendingTransaction({
      type: "COIN_PURCHASE",
      amountUsdt: Number(pack.priceUsdt),
      payerId: user.id,
      coinPackageId: pack.id,
    });
    const data = buildPaymentPayload({
      jettonWalletAddress,
      payerWalletAddress,
      destinationOwnerAddress: getPlatformTonAddress(),
      amountUsdt: Number(pack.priceUsdt),
      comment,
      transactionId: transaction.id,
    });
    return { success: true, data };
  } catch (err) {
    return handlePaymentError(err);
  }
}

export async function createTonCustomCoinPayment(coins: number, payerWalletAddress: string): Promise<ActionResult<TonPaymentRequest>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: "برای خرید باید وارد شوید" };
  if (user.isBanned) return { success: false, error: "حساب شما مسدود شده است" };
  if (!isTonConfigured()) return { success: false, error: "پرداخت هنوز پیکربندی نشده است" };

  const coinCost = await getChapterUnlockCoinCost();
  if (!Number.isInteger(coins) || coins < coinCost || coins > MAX_CUSTOM_COINS) {
    return { success: false, error: `تعداد سکه باید حداقل ${coinCost.toLocaleString("fa-IR")} و حداکثر ${MAX_CUSTOM_COINS.toLocaleString("fa-IR")} باشد` };
  }

  const allowed = await checkRateLimit(`usdt-coins-custom:${user.id}`, 5);
  if (!allowed) return { success: false, error: "تعداد درخواست‌ها بیش از حد مجاز است، کمی صبر کنید" };

  const coinPriceUsdt = await getCoinPriceUsdt();
  const amountUsdt = Math.round(coins * coinPriceUsdt * 1e6) / 1e6;

  try {
    const jettonWalletAddress = await getJettonWalletAddress(payerWalletAddress);
    const { transaction, comment } = await createPendingTransaction({
      type: "COIN_PURCHASE",
      amountUsdt,
      payerId: user.id,
      customCoins: coins,
    });
    const data = buildPaymentPayload({
      jettonWalletAddress,
      payerWalletAddress,
      destinationOwnerAddress: getPlatformTonAddress(),
      amountUsdt,
      comment,
      transactionId: transaction.id,
    });
    return { success: true, data };
  } catch (err) {
    return handlePaymentError(err);
  }
}

export async function createTonDonationPayment(input: {
  receiverId: string;
  amountUsdt: number;
  message?: string;
  payerWalletAddress: string;
}): Promise<ActionResult<TonPaymentRequest>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: "برای حمایت مالی باید وارد شوید" };
  if (user.isBanned) return { success: false, error: "حساب شما مسدود شده است" };
  if (!isTonConfigured()) return { success: false, error: "پرداخت هنوز پیکربندی نشده است" };
  if (input.receiverId === user.id) return { success: false, error: "نمی‌توانید به خودتان حمایت مالی کنید" };
  if (!Number.isFinite(input.amountUsdt) || input.amountUsdt < MIN_DONATION_USDT || input.amountUsdt > MAX_DONATION_USDT) {
    return { success: false, error: `مبلغ حمایت باید بین ${MIN_DONATION_USDT} تا ${MAX_DONATION_USDT} USDT باشد` };
  }

  const allowed = await checkRateLimit(`usdt-donate:${user.id}`, 5);
  if (!allowed) return { success: false, error: "تعداد درخواست‌ها بیش از حد مجاز است، کمی صبر کنید" };

  const receiver = await prisma.user.findFirst({
    where: {
      id: input.receiverId,
      OR: [{ staffRoles: { some: {} } }, { chapterStaffRoles: { some: {} } }, { publisherProfile: { isNot: null } }],
    },
    select: { cryptoWalletAddress: true },
  });
  if (!receiver) return { success: false, error: "این کاربر واجد شرایط دریافت حمایت مالی نیست" };
  if (!receiver.cryptoWalletAddress) return { success: false, error: "این کاربر آدرس کیف پول تون ثبت نکرده است" };

  try {
    const jettonWalletAddress = await getJettonWalletAddress(input.payerWalletAddress);
    const { transaction, comment } = await createPendingTransaction({
      type: "DONATION",
      amountUsdt: input.amountUsdt,
      payerId: user.id,
      receiverId: input.receiverId,
      message: input.message?.trim().slice(0, 300),
    });
    const data = buildPaymentPayload({
      jettonWalletAddress,
      payerWalletAddress: input.payerWalletAddress,
      destinationOwnerAddress: receiver.cryptoWalletAddress,
      amountUsdt: input.amountUsdt,
      comment,
      transactionId: transaction.id,
    });
    return { success: true, data };
  } catch (err) {
    return handlePaymentError(err);
  }
}

export async function createTonPublisherPayoutPayment(input: {
  publisherId: string;
  amountUsdt: number;
  periodStart: string;
  periodEnd: string;
  payerWalletAddress: string;
}): Promise<ActionResult<TonPaymentRequest>> {
  try {
    const admin = await requireAdmin();
    if (!Number.isFinite(input.amountUsdt) || input.amountUsdt <= 0) {
      return { success: false, error: "مبلغ باید مثبت باشد" };
    }

    const publisher = await prisma.publisher.findUnique({
      where: { id: input.publisherId },
      select: { id: true, cryptoWalletAddress: true },
    });
    if (!publisher) return { success: false, error: "ناشر یافت نشد" };
    if (!publisher.cryptoWalletAddress) return { success: false, error: "این ناشر آدرس کیف پول تون ثبت نکرده است" };

    const jettonWalletAddress = await getJettonWalletAddress(input.payerWalletAddress);

    const { transaction, comment } = await createPendingTransaction({
      type: "PUBLISHER_PAYOUT",
      amountUsdt: input.amountUsdt,
      payerId: admin.id,
      payoutPublisherId: publisher.id,
    });

    await prisma.payoutRequest.create({
      data: {
        publisherId: publisher.id,
        amountTon: input.amountUsdt,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        status: "PENDING",
        reviewedById: admin.id,
        reviewedAt: new Date(),
        tonTransactionId: transaction.id,
      },
    });

    const data = buildPaymentPayload({
      jettonWalletAddress,
      payerWalletAddress: input.payerWalletAddress,
      destinationOwnerAddress: publisher.cryptoWalletAddress,
      amountUsdt: input.amountUsdt,
      comment,
      transactionId: transaction.id,
    });
    return { success: true, data };
  } catch (err) {
    return handlePaymentError(err);
  }
}

export interface TonVerifyResult {
  status: "PAID" | "PENDING" | "FAILED";
}

export async function verifyTonPayment(transactionId: string): Promise<ActionResult<TonVerifyResult>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const allowed = await checkRateLimit(`ton-verify:${user.id}`, 60);
  if (!allowed) return { success: false, error: "تعداد درخواست‌ها بیش از حد مجاز است" };

  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!transaction || transaction.payerId !== user.id) {
    return { success: false, error: "تراکنش یافت نشد" };
  }

  if (transaction.status === "PAID") {
    revalidatePath("/app/shop");
    revalidatePath("/app/profile");
    revalidatePath("/admin/payouts");
    return { success: true, data: { status: "PAID" } };
  }
  if (transaction.status === "FAILED") return { success: true, data: { status: "FAILED" } };

  const settlement = await settlePendingTonTransaction(transaction).catch((err) => {
    console.error("[ton-payments] on-demand settlement check failed", err);
    return "PENDING" as const;
  });

  if (settlement === "PAID") {
    revalidatePath("/app/shop");
    revalidatePath("/app/profile");
    revalidatePath("/admin/payouts");
    return { success: true, data: { status: "PAID" } };
  }
  if (settlement === "FAILED") return { success: true, data: { status: "FAILED" } };

  return { success: true, data: { status: "PENDING" } };
}