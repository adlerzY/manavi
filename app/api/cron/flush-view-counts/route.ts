import { NextRequest, NextResponse } from "next/server";
import { flushBufferedViewCounts } from "@/lib/view-counter";
import { executeScheduledPublish } from "@/lib/scheduled-publish";
import { cleanupOldAuditLogs } from "@/lib/audit-log";
import { cleanupOldFailedTransactions } from "@/lib/transaction-cleanup";

const CRON_SECRET = process.env.CRON_SECRET;
const AUDIT_LOG_RETENTION_DAYS = Number(process.env.AUDIT_LOG_RETENTION_DAYS ?? 180);

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

  const [viewCounts, scheduledPublish, auditLogsDeleted, failedTransactionsDeleted] = await Promise.all([
    flushBufferedViewCounts(),
    executeScheduledPublish(),
    cleanupOldAuditLogs(AUDIT_LOG_RETENTION_DAYS).catch(() => 0),
    cleanupOldFailedTransactions().catch(() => 0),
  ]);

  return NextResponse.json({ ok: true, ...viewCounts, scheduledPublish, auditLogsDeleted, failedTransactionsDeleted });
}