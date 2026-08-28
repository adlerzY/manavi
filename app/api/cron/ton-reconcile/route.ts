import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { settlePendingTonTransactions, failStalePendingTonTransactions } from "@/lib/ton-settlement";

const CRON_SECRET = process.env.CRON_SECRET;
const RECONCILE_MIN_AGE_MS = 15_000;
const RECONCILE_MAX_AGE_MS = 25 * 60 * 60 * 1000;
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

  const now = Date.now();
  const pending = await prisma.transaction.findMany({
    where: {
      status: "PENDING",
      currency: "USDT",
      tonComment: { not: null },
      createdAt: {
        lte: new Date(now - RECONCILE_MIN_AGE_MS),
        gte: new Date(now - RECONCILE_MAX_AGE_MS),
      },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  const result = await settlePendingTonTransactions(pending);
  const staleResult = await failStalePendingTonTransactions();

  return NextResponse.json({ ok: true, ...result, ...staleResult });
}