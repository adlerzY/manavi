"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ApprovalRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { safeError, type ActionResult } from "@/lib/errors";
import { logAuditEvent } from "@/lib/audit-log";
import { createNotifications } from "@/lib/notifications";
import { APPROVAL_VALID_HOURS, OPERATION_DEFAULTS, operationLabel } from "@/lib/operations";

const STATUSES: ApprovalRequestStatus[] = ["PENDING", "APPROVED", "REJECTED", "CONSUMED"];
const LIST_LIMIT = 100;

export interface ApprovalRow {
  id: string;
  operation: string;
  operationLabel: string;
  summary: string;
  targetType: string;
  status: ApprovalRequestStatus;
  actorName: string;
  publisherName: string | null;
  createdAt: string;
  decisionNote: string | null;
  expiresAt: string | null;
}

export interface PolicyRow {
  operation: string;
  label: string;
  maxUnits: number;
  windowHours: number;
  isEnabled: boolean;
  isCustom: boolean;
}

export async function listApprovals(status: string = "PENDING"): Promise<ApprovalRow[]> {
  await requireAdmin();

  const filter = STATUSES.find((item) => item === status);
  const rows = await prisma.operationApproval.findMany({
    where: filter ? { status: filter } : {},
    orderBy: { createdAt: filter === "PENDING" ? "asc" : "desc" },
    take: LIST_LIMIT,
  });

  const actorIds = [...new Set(rows.map((row) => row.actorId))];
  const publisherIds = [...new Set(rows.map((row) => row.publisherId).filter((id): id is string => Boolean(id)))];

  const [actors, publishers] = await Promise.all([
    actorIds.length
      ? prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, username: true } })
      : Promise.resolve([]),
    publisherIds.length
      ? prisma.publisher.findMany({ where: { id: { in: publisherIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  const actorById = new Map(actors.map((actor) => [actor.id, actor.username ? `@${actor.username}` : actor.firstName]));
  const publisherById = new Map(publishers.map((publisher) => [publisher.id, publisher.name]));

  return rows.map((row) => ({
    id: row.id,
    operation: row.operation,
    operationLabel: operationLabel(row.operation),
    summary: row.summary,
    targetType: row.targetType,
    status: row.status,
    actorName: actorById.get(row.actorId) ?? "—",
    publisherName: row.publisherId ? publisherById.get(row.publisherId) ?? null : null,
    createdAt: row.createdAt.toISOString(),
    decisionNote: row.decisionNote,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  }));
}

export async function decideApprovals(ids: string[], approve: boolean, note?: string): Promise<ActionResult<{ count: number }>> {
  try {
    const admin = await requireAdmin();

    const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, LIST_LIMIT);
    if (uniqueIds.length === 0) return { success: false, error: "موردی انتخاب نشده است" };

    const cleanNote = note?.trim().slice(0, 300) || null;
    if (!approve && !cleanNote) return { success: false, error: "برای رد کردن، دلیل را بنویسید" };

    const pending = await prisma.operationApproval.findMany({
      where: { id: { in: uniqueIds }, status: "PENDING" },
      select: { id: true, actorId: true, operation: true, summary: true },
    });
    if (pending.length === 0) return { success: false, error: "درخواست در انتظاری یافت نشد" };

    const now = new Date();
    const updated = await prisma.operationApproval.updateMany({
      where: { id: { in: pending.map((item) => item.id) }, status: "PENDING" },
      data: approve
        ? {
            status: "APPROVED",
            decidedById: admin.id,
            decidedAt: now,
            decisionNote: cleanNote,
            expiresAt: new Date(now.getTime() + APPROVAL_VALID_HOURS * 60 * 60 * 1000),
          }
        : { status: "REJECTED", decidedById: admin.id, decidedAt: now, decisionNote: cleanNote },
    });

    after(async () => {
      await logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: approve ? "operation.approve" : "operation.reject",
        targetType: "OperationApproval",
        metadata: { ids: pending.map((item) => item.id), note: cleanNote },
      });
      await createNotifications(
        pending.map((item) => ({
          userId: item.actorId,
          type: "SYSTEM" as const,
          title: approve ? "درخواست عملیات شما تأیید شد" : "درخواست عملیات شما رد شد",
          body: `${operationLabel(item.operation)} — ${item.summary}${cleanNote ? ` — ${cleanNote}` : ""}`.slice(0, 300),
          href: "/publisher/comics",
          dedupeKey: `operation-decision:${item.id}`,
        }))
      ).catch(() => {});
    });

    revalidatePath("/admin/operations");
    revalidatePath("/admin");
    return { success: true, data: { count: updated.count } };
  } catch (err) {
    return safeError(err);
  }
}

export async function listOperationPolicies(): Promise<PolicyRow[]> {
  await requireAdmin();

  const rows = await prisma.operationPolicy.findMany();
  const byOperation = new Map(rows.map((row) => [row.operation, row]));

  return Object.entries(OPERATION_DEFAULTS).map(([operation, defaults]) => {
    const row = byOperation.get(operation);
    return {
      operation,
      label: defaults.label,
      maxUnits: row?.maxUnits ?? defaults.maxUnits,
      windowHours: row?.windowHours ?? defaults.windowHours,
      isEnabled: row?.isEnabled ?? true,
      isCustom: Boolean(row),
    };
  });
}

export async function updateOperationPolicy(input: {
  operation: string;
  maxUnits: number;
  windowHours: number;
  isEnabled: boolean;
}): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    if (!(input.operation in OPERATION_DEFAULTS)) return { success: false, error: "عملیات نامعتبر است" };
    if (!Number.isInteger(input.maxUnits) || input.maxUnits < 1 || input.maxUnits > 10_000) {
      return { success: false, error: "سقف مجاز باید عددی صحیح بین ۱ تا ۱۰٬۰۰۰ باشد" };
    }
    if (!Number.isInteger(input.windowHours) || input.windowHours < 1 || input.windowHours > 720) {
      return { success: false, error: "بازه‌ی زمانی باید بین ۱ تا ۷۲۰ ساعت باشد" };
    }

    await prisma.operationPolicy.upsert({
      where: { operation: input.operation },
      update: { maxUnits: input.maxUnits, windowHours: input.windowHours, isEnabled: Boolean(input.isEnabled), updatedById: admin.id },
      create: {
        operation: input.operation,
        maxUnits: input.maxUnits,
        windowHours: input.windowHours,
        isEnabled: Boolean(input.isEnabled),
        updatedById: admin.id,
      },
    });

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "operation.policyUpdate",
        targetType: "OperationPolicy",
        targetId: input.operation,
        metadata: { maxUnits: input.maxUnits, windowHours: input.windowHours, isEnabled: Boolean(input.isEnabled) },
      })
    );

    revalidatePath("/admin/operations");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function resetOperationPolicy(operation: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (!(operation in OPERATION_DEFAULTS)) return { success: false, error: "عملیات نامعتبر است" };

    await prisma.operationPolicy.deleteMany({ where: { operation } });

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "operation.policyUpdate",
        targetType: "OperationPolicy",
        targetId: operation,
        metadata: { reset: true },
      })
    );

    revalidatePath("/admin/operations");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}