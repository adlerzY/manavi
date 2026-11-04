import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { logAuditEvent } from "./audit-log";
import { notifyAdmins } from "./notifications";
import { notifyAdmin } from "./admin-alert";
import { OPERATION_DEFAULTS, operationLabel } from "./operations";

export interface GuardInput {
  actor: { id: string; role: string };
  operation: string;
  targetType: string;
  targetId: string;
  summary: string;
  units?: number;
  publisherId?: string | null;
  comicId?: string | null;
}

export type GuardResult = { ok: true } | { ok: false; message: string };

interface Policy {
  maxUnits: number;
  windowHours: number;
  isEnabled: boolean;
}

type Outcome =
  | { kind: "ok" }
  | { kind: "override" }
  | { kind: "approved"; approvalId: string }
  | { kind: "blocked"; approvalId: string; isNew: boolean };

async function loadPolicy(operation: string): Promise<Policy | null> {
  const row = await prisma.operationPolicy.findUnique({ where: { operation } });
  if (row) return { maxUnits: row.maxUnits, windowHours: row.windowHours, isEnabled: row.isEnabled };
  const fallback = OPERATION_DEFAULTS[operation];
  return fallback ? { maxUnits: fallback.maxUnits, windowHours: fallback.windowHours, isEnabled: true } : null;
}

export async function checkOperation(input: GuardInput): Promise<GuardResult> {
  const policy = await loadPolicy(input.operation);
  const units = Math.max(1, Math.floor(input.units ?? 1));
  const isAdmin = input.actor.role === "ADMIN";
  const actorId = input.actor.id;

  const baseLog = {
    operation: input.operation,
    actorId,
    publisherId: input.publisherId ?? null,
    comicId: input.comicId ?? null,
    units,
  };

  if (!policy || !policy.isEnabled) {
    await prisma.operationLog.create({ data: baseLog });
    return { ok: true };
  }

  const since = new Date(Date.now() - policy.windowHours * 60 * 60 * 1000);

  const outcome = await prisma.$transaction(
    async (tx): Promise<Outcome> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`op:${input.operation}`}))`;

      const scopes: Prisma.OperationLogWhereInput[] = [{ actorId }];
      if (input.publisherId) scopes.push({ publisherId: input.publisherId });
      if (input.comicId) scopes.push({ comicId: input.comicId });

      const sums = await Promise.all(
        scopes.map((scope) =>
          tx.operationLog.aggregate({
            where: { operation: input.operation, createdAt: { gte: since }, ...scope },
            _sum: { units: true },
          })
        )
      );
      const exceeded = sums.some((sum) => (sum._sum.units ?? 0) + units > policy.maxUnits);

      if (!exceeded) {
        await tx.operationLog.create({ data: baseLog });
        return { kind: "ok" };
      }

      if (isAdmin) {
        await tx.operationLog.create({ data: baseLog });
        return { kind: "override" };
      }

      const approval = await tx.operationApproval.findFirst({
        where: { operation: input.operation, actorId, targetId: input.targetId, status: "APPROVED", expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "asc" },
      });
      if (approval) {
        await tx.operationApproval.update({ where: { id: approval.id }, data: { status: "CONSUMED", consumedAt: new Date() } });
        await tx.operationLog.create({ data: baseLog });
        return { kind: "approved", approvalId: approval.id };
      }

      const pending = await tx.operationApproval.findFirst({
        where: { operation: input.operation, actorId, targetId: input.targetId, status: "PENDING" },
      });
      const created =
        pending ??
        (await tx.operationApproval.create({
          data: {
            operation: input.operation,
            actorId,
            publisherId: input.publisherId ?? null,
            comicId: input.comicId ?? null,
            targetType: input.targetType,
            targetId: input.targetId,
            summary: input.summary.slice(0, 300),
            units,
          },
        }));
      return { kind: "blocked", approvalId: created.id, isNew: !pending };
    },
    { timeout: 10_000, maxWait: 5_000 }
  );

  if (outcome.kind === "ok") return { ok: true };

  if (outcome.kind === "override") {
    await logAuditEvent({
      actorId,
      actorRole: input.actor.role,
      action: "security.override",
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: { operation: input.operation, units, maxUnits: policy.maxUnits, windowHours: policy.windowHours },
    });
    return { ok: true };
  }

  if (outcome.kind === "approved") {
    await logAuditEvent({
      actorId,
      actorRole: input.actor.role,
      action: "operation.consume",
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: { operation: input.operation, approvalId: outcome.approvalId },
    });
    return { ok: true };
  }

  if (outcome.isNew) {
    await logAuditEvent({
      actorId,
      actorRole: input.actor.role,
      action: "security.limitExceeded",
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: { operation: input.operation, units, maxUnits: policy.maxUnits, windowHours: policy.windowHours, approvalId: outcome.approvalId },
    });
    notifyAdmins({
      type: "SYSTEM",
      title: "درخواست تأیید عملیات حساس",
      body: `${operationLabel(input.operation)} — ${input.summary}`.slice(0, 300),
      href: "/admin/operations",
      dedupeKey: `operation-approval:${outcome.approvalId}`,
    }).catch(() => {});
    notifyAdmin("سقف عملیات حساس پر شد", `${operationLabel(input.operation)}\n${input.summary}`, "warning").catch(() => {});
  }

  return {
    ok: false,
    message: `سقف مجاز «${operationLabel(input.operation)}» (${policy.maxUnits.toLocaleString("fa-IR")} مورد در ${policy.windowHours.toLocaleString("fa-IR")} ساعت) پر شده است. درخواست تأیید برای مدیریت ارسال شد؛ پس از تأیید می‌توانید دوباره تلاش کنید.`,
  };
}