import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { tehranDateRange } from "./date-range";

export type AuditAction =
  | "comic.create" | "comic.update" | "comic.delete"
  | "comic.approve" | "comic.reject"
  | "chapter.approve" | "chapter.reject"
  | "chapter.update" | "chapter.pageRemove" | "chapter.bulkAccessTypeChange"
  | "genre.create"
  | "publisher.create" | "publisher.verify" | "publisher.linkOwner" | "publisher.unlinkOwner"
  | "staff.verify"
  | "report.resolve"
  | "license.create" | "license.activate" | "license.terminate"
  | "user.ban" | "user.unban" | "user.roleChange"
  | "user.coinGrant" | "user.coinRevoke" | "user.delete"
  | "platformSettings.update"
  | "publisherStaff.permissionChange"
  | "comicStaff.shareChange"
  | "settlement.createPeriod" | "settlement.recalculate" | "settlement.lockPeriod"
  | "settlement.lineStatus" | "settlement.payout" | "settlement.note";

interface LogAuditEventInput {
  actorId: string;
  actorRole: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
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
        metadata: input.metadata ?? Prisma.JsonNull,
      },
    });
  } catch (err) {
    console.error("[audit-log] write failed", err);
  }
}

export interface AuditLogRow {
  id: string;
  actorId: string;
  actorName: string | null;
  actorRole: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface SearchAuditLogParams {
  actorId?: string;
  actorQuery?: string;
  action?: string;
  group?: string;
  targetType?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function searchAuditLog(params: SearchAuditLogParams): Promise<{ logs: AuditLogRow[]; total: number }> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 50));

  let actorIds: string[] | undefined;
  const actorQuery = params.actorQuery?.trim().slice(0, 100);
  if (actorQuery) {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { firstName: { contains: actorQuery, mode: "insensitive" } },
          { lastName: { contains: actorQuery, mode: "insensitive" } },
          { username: { contains: actorQuery, mode: "insensitive" } },
        ],
      },
      select: { id: true },
      take: 50,
    });
    actorIds = users.map((user) => user.id);
  }

  const group = params.group && /^[a-zA-Z]+$/.test(params.group) ? params.group : undefined;
  const range = tehranDateRange(params.from, params.to);

  const where: Prisma.AuditLogWhereInput = {
    ...(params.actorId ? { actorId: params.actorId } : actorIds ? { actorId: { in: actorIds } } : {}),
    ...(params.action ? { action: params.action } : group ? { action: { startsWith: `${group}.` } } : {}),
    ...(params.targetType ? { targetType: params.targetType } : {}),
    ...(range ? { createdAt: range } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.auditLog.count({ where }),
  ]);

  const rowActorIds = [...new Set(rows.map((row) => row.actorId))];
  const actors = rowActorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: rowActorIds } },
        select: { id: true, firstName: true, username: true },
      })
    : [];
  const actorById = new Map(actors.map((actor) => [actor.id, actor.username ? `@${actor.username}` : actor.firstName]));

  return {
    logs: rows.map((row) => ({
      ...row,
      actorName: actorById.get(row.actorId) ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
  };
}

const PROTECTED_AUDIT_ACTION_PREFIXES = [
  "user.roleChange",
  "user.coinGrant",
  "user.coinRevoke",
  "user.ban",
  "user.unban",
  "user.delete",
  "settlement.",
  "license.",
  "platformSettings.",
  "publisher.",
];

export async function cleanupOldAuditLogs(days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.auditLog.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      NOT: PROTECTED_AUDIT_ACTION_PREFIXES.map((prefix) => ({ action: { startsWith: prefix } })),
    },
  });
  return result.count;
}