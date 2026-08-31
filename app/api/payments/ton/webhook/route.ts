import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { isTonConfigured } from "@/lib/ton";
import { settlePendingTonTransactions } from "@/lib/ton-settlement";
import { checkRateLimit } from "@/lib/moderation";
import { notifyAdmin } from "@/lib/admin-alert";

const WEBHOOK_SECRET = process.env.TONAPI_WEBHOOK_SECRET;

const MAX_BODY_BYTES = 256 * 1024;
const WEBHOOK_RATE_LIMIT_PER_MINUTE = 20;
const MISCONFIG_ALERT_THROTTLE_MS = 30 * 60 * 1000;

let lastMisconfigAlertAt = 0;

function alertMisconfiguration(reason: string) {
  const now = Date.now();
  if (now - lastMisconfigAlertAt < MISCONFIG_ALERT_THROTTLE_MS) return;
  lastMisconfigAlertAt = now;
  notifyAdmin("وبهوک پرداخت TON رد شد", reason, "warning").catch(() => {});
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (!WEBHOOK_SECRET) {
    alertMisconfiguration("TONAPI_WEBHOOK_SECRET تنظیم نشده — درخواست‌های ورودی نادیده گرفته می‌شوند.");
    return NextResponse.json({ ok: true, skipped: true });
  }

  const provided =
    req.headers.get("x-tonapi-webhook-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!timingSafeEqualStrings(provided, WEBHOOK_SECRET)) {
    alertMisconfiguration("امضای وبهوک TonAPI نامعتبر بود.");
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (!isTonConfigured()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "ton-not-configured" });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const allowed = await checkRateLimit(`ton-webhook:${ip}`, WEBHOOK_RATE_LIMIT_PER_MINUTE);
  if (!allowed) {
    return NextResponse.json({ ok: true, rateLimited: true });
  }

  await req.json().catch(() => null);

  const pending = await prisma.transaction.findMany({
    where: { status: "PENDING", currency: "USDT", tonComment: { not: null } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  try {
    const result = await settlePendingTonTransactions(pending);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[ton-webhook] settlement failed", err);
    return NextResponse.json({ ok: true, error: "settlement-failed" });
  }
}