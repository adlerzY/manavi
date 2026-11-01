import { NextRequest, NextResponse, after } from "next/server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/moderation";
import { logAuditEvent } from "@/lib/audit-log";
import { ENTITY_ID_PATTERN } from "@/lib/asset-kinds";
import { optimizeToWebp, ImageProcessorUnavailableError, UnsupportedImageError } from "@/lib/image-process";
import { deleteObject, putPrivateObject } from "@/lib/s3";
import { describeUploadError } from "@/lib/upload-error";
import { WithdrawalError, markWithdrawalPaid, notifyRequester } from "@/lib/withdrawals";
import { WITHDRAWAL_RECEIPT_MAX_BYTES, formatCoins, formatToman } from "@/lib/withdrawal-types";

export const runtime = "nodejs";
export const maxDuration = 30;

const PAYMENTS_PER_MINUTE = 20;

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

function isBlobLike(value: unknown): value is Blob {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Blob).arrayBuffer === "function" &&
    typeof (value as Blob).size === "number"
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (req.headers.get("x-manavi-upload") !== "1" || !isSameOrigin(req)) {
    return fail(403, "درخواست نامعتبر است");
  }

  const { id } = await params;
  if (!ENTITY_ID_PATTERN.test(id)) return fail(400, "شناسه‌ی درخواست نامعتبر است");

  const admin = await getSessionUser();
  if (!admin || admin.role !== "ADMIN" || admin.isBanned) return fail(403, "دسترسی غیرمجاز");

  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > WITHDRAWAL_RECEIPT_MAX_BYTES + 200_000) return fail(413, "حجم فایل بیش از حد مجاز است");

  const allowed = await checkRateLimit(`withdrawal-pay:${admin.id}`, PAYMENTS_PER_MINUTE);
  if (!allowed) return fail(429, "تعداد درخواست‌ها بیش از حد مجاز است — کمی صبر کنید");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "بدنه‌ی درخواست نامعتبر است");
  }

  const file = form.get("receipt");
  const reference = form.get("reference");
  const note = form.get("note");

  if (!isBlobLike(file)) return fail(400, "تصویر رسید الزامی است");
  if (file.size === 0) return fail(400, "فایل رسید خالی است");
  if (file.size > WITHDRAWAL_RECEIPT_MAX_BYTES) return fail(413, "حجم تصویر رسید بیش از حد مجاز است");

  const current = await prisma.withdrawalRequest.findUnique({ where: { id }, select: { status: true } });
  if (!current) return fail(404, "درخواست یافت نشد");
  if (current.status !== "PENDING" && current.status !== "PROCESSING") {
    return fail(409, "این درخواست دیگر قابل پرداخت نیست");
  }

  let optimized;
  try {
    optimized = await optimizeToWebp(Buffer.from(await file.arrayBuffer()), {
      maxWidth: 1600,
      maxHeight: 2400,
      webpQuality: 82,
    });
  } catch (err) {
    if (err instanceof UnsupportedImageError) return fail(415, err.message);
    if (err instanceof ImageProcessorUnavailableError) return fail(500, err.message);
    console.error("[withdrawal-pay] receipt processing failed", err);
    return fail(500, "پردازش تصویر رسید ناموفق بود — دوباره تلاش کنید");
  }

  const receiptKey = `private/withdrawals/${id}/${randomUUID()}.webp`;

  try {
    await putPrivateObject(receiptKey, optimized.data, "image/webp");
  } catch (err) {
    return fail(502, describeUploadError(err));
  }

  try {
    const result = await markWithdrawalPaid({
      id,
      admin: { id: admin.id, role: admin.role },
      receiptKey,
      reference: typeof reference === "string" ? reference : null,
      note: typeof note === "string" ? note : null,
    });

    after(() => {
      notifyRequester(
        result.requesterId,
        id,
        "paid",
        "درخواست تسویه‌حساب شما پرداخت شد",
        `${result.code} — ${formatCoins(result.coins)} سکه معادل ${formatToman(result.toman)} — لطفاً دریافت را تأیید کنید`
      ).catch(() => {});
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "withdrawal.pay",
        targetType: "WithdrawalRequest",
        targetId: id,
        metadata: { code: result.code, coins: result.coins, toman: result.toman },
      });
    });

    revalidatePath("/admin/payouts");
    revalidatePath("/admin");
    revalidatePath("/app/earnings");
    revalidatePath("/publisher/earnings");
    revalidatePath("/publisher");

    return NextResponse.json({ success: true, data: { code: result.code } }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    await deleteObject(receiptKey).catch(() => {});
    if (err instanceof WithdrawalError) return fail(409, err.message);
    console.error("[withdrawal-pay] failed", err);
    return fail(500, "ثبت پرداخت ناموفق بود — دوباره تلاش کنید");
  }
}