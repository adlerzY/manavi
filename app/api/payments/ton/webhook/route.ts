import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { settlePendingTonTransactions } from "@/lib/ton-settlement";

const WEBHOOK_SECRET = process.env.TONAPI_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && !WEBHOOK_SECRET) {
  return NextResponse.json({ error: "webhook secret not configured" }, { status: 500 });
 }
  if (WEBHOOK_SECRET) {
    const provided =
      req.headers.get("x-tonapi-webhook-secret") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }


  await req.json().catch(() => null);

  const pending = await prisma.transaction.findMany({
    where: { status: "PENDING", currency: "USDT", tonComment: { not: null } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  const result = await settlePendingTonTransactions(pending);

  return NextResponse.json({ ok: true, ...result });
}