import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findWalletMismatches, findAllocationDiscrepancies, findDonationDiscrepancies } from "@/lib/ledger";
import { notifyAdmin } from "@/lib/admin-alert";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && !CRON_SECRET) {
    return NextResponse.json({ error: "cron secret not configured" }, { status: 500 });
  }
  if (CRON_SECRET) {
    const provided = req.headers.get("authorization");
    if (provided !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const [walletMismatches, allocationDiscrepancies, donationDiscrepancies, unledgeredPurchases] = await Promise.all([
      findWalletMismatches(50),
      findAllocationDiscrepancies(50),
      findDonationDiscrepancies(50),
      prisma.$queryRaw<{ id: string }[]>`
        SELECT t."id" FROM "Transaction" t
        WHERE t."type" = 'COIN_PURCHASE' AND t."status" = 'PAID' AND t."currency" = 'USDT'
          AND t."createdAt" > COALESCE((SELECT MAX(l."createdAt") FROM "LedgerEntry" l WHERE l."sourceType" = 'OPENING_BALANCE'), NOW())
          AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" l WHERE l."sourceType" = 'COIN_PURCHASE' AND l."sourceId" = t."id")
        LIMIT 50`,
    ]);

    const problems: string[] = [];
    if (walletMismatches.length > 0) {
      problems.push(`مغایرت موجودی کیف پول: ${walletMismatches.length} کاربر (نمونه: ${walletMismatches.slice(0, 3).map((m) => m.userId).join(", ")})`);
    }
    if (allocationDiscrepancies.length > 0) {
      problems.push(`فروش با تخصیص درآمد ناقص یا مازاد: ${allocationDiscrepancies.length} ردیف (نمونه: ${allocationDiscrepancies.slice(0, 3).join(", ")})`);
    }
    if (donationDiscrepancies.length > 0) {
      problems.push(`دونیت با ثبت مالی ناقص: ${donationDiscrepancies.length} مورد (نمونه: ${donationDiscrepancies.slice(0, 3).join(", ")})`);
    }
    if (unledgeredPurchases.length > 0) {
      problems.push(`خرید سکه‌ی تأییدشده بدون ثبت در دفتر کل: ${unledgeredPurchases.length} تراکنش (نمونه: ${unledgeredPurchases.slice(0, 3).map((t) => t.id).join(", ")})`);
    }

    if (problems.length > 0) {
      await notifyAdmin("مغایرت در تطبیق مالی", problems.join("\n"), "error");
    }

    return NextResponse.json({
      ok: true,
      walletMismatches: walletMismatches.length,
      allocationDiscrepancies: allocationDiscrepancies.length,
      donationDiscrepancies: donationDiscrepancies.length,
      unledgeredPurchases: unledgeredPurchases.length,
    });
  } catch (err) {
    await notifyAdmin("کران ledger-reconcile شکست خورد", err instanceof Error ? err.message : String(err), "error");
    return NextResponse.json({ ok: false, error: "cron failed" }, { status: 500 });
  }
}
