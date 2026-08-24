import { NextRequest, NextResponse } from "next/server";
import { flushBufferedViewCounts } from "@/lib/view-counter";
import { executeScheduledPublish } from "@/lib/scheduled-publish";

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

  const [viewCounts, scheduledPublish] = await Promise.all([
    flushBufferedViewCounts(),
    executeScheduledPublish(),
  ]);

  return NextResponse.json({ ok: true, ...viewCounts, scheduledPublish });
}