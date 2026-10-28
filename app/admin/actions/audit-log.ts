"use server";

import { requireAdmin } from "@/lib/auth";
import { searchAuditLog, cleanupOldAuditLogs, type AuditLogRow, type SearchAuditLogParams } from "@/lib/audit-log";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export async function searchAuditLogAction(params: SearchAuditLogParams): Promise<{ logs: AuditLogRow[]; total: number }> {
  await requireAdmin();
  return searchAuditLog(params);
}

export async function cleanupAuditLogAction(days: number): Promise<ActionResult<{ deleted: number }>> {
  try {
    await requireAdmin();
    if (!Number.isFinite(days) || days <= 0) {
      return { success: false, error: "تعداد روز باید عددی مثبت باشد" };
    }
    const deleted = await cleanupOldAuditLogs(days);
    return { success: true, data: { deleted } };
  } catch {
    return { success: false, error: "خطا در پاکسازی" };
  }
}