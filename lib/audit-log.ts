import "server-only";
import { prisma } from "./prisma";

export type AuditAction =
  | "comic.create" | "comic.update" | "comic.delete"
  | "comic.approve" | "comic.reject"
  | "chapter.approve" | "chapter.reject"
  | "genre.create"
  | "publisher.verify" | "staff.verify"
  | "user.ban" | "user.unban" | "user.roleChange"
  | "user.coinGrant" | "user.coinRevoke" | "user.delete"
  | "platformSettings.update"
  | "publisherStaff.permissionChange";

interface LogAuditEventInput {
  actorId: string;
  actorRole: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export async function logAuditEvent(input: LogAuditEventInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata,
      },
    });
  } catch (err) {
    console.error("[audit-log] write failed", err);
  }
}

export interface AuditLogRow {
  id: string;
  actorId: string;
  actorRole: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: string;
}

export async function searchAuditLog(params: {
  actorId?: string;
  action?: string;
  targetType?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ logs: AuditLogRow[]; total: number }> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 50;
  const where = { actorId: params.actorId, action: params.action, targetType: params.targetType };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })), total };
}

export async function cleanupOldAuditLogs(days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return result.count;
}