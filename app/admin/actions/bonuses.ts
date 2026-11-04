"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { BonusTrigger } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, requireEditionAccess, type SessionUser } from "@/lib/auth";
import { AccessDeniedError, assertComicPermission } from "@/lib/access";
import { safeError, type ActionResult } from "@/lib/errors";
import { logAuditEvent } from "@/lib/audit-log";
import { getLanguageLabels } from "@/lib/language-registry";
import { BonusLimitError, applyBonusBackfill, isBonusTrigger, planBonusBackfill } from "@/lib/bonus";

export type BonusState = "PERMANENT" | "SCHEDULED" | "RUNNING" | "ENDED";

export interface BonusRow {
  id: string;
  sourceLabel: string;
  targetLabel: string;
  trigger: BonusTrigger;
  isActive: boolean;
  name: string | null;
  startsAt: string | null;
  endsAt: string | null;
  note: string | null;
  grantCount: number;
  canManage: boolean;
  state: BonusState;
}

export interface BonusEditionOption {
  id: string;
  label: string;
  manageable: boolean;
}

export interface BonusOverview {
  editions: BonusEditionOption[];
  bonuses: BonusRow[];
}

async function requireActiveUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AccessDeniedError("برای این عملیات باید وارد شوید");
  if (user.isBanned) throw new AccessDeniedError("حساب شما مسدود شده است");
  return user;
}

function parseDate(value: string | null | undefined): Date | null | "invalid" {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

function stateOf(link: { startsAt: Date | null; endsAt: Date | null }, now: Date): BonusState {
  if (!link.startsAt && !link.endsAt) return "PERMANENT";
  if (link.startsAt && link.startsAt > now) return "SCHEDULED";
  if (link.endsAt && link.endsAt < now) return "ENDED";
  return "RUNNING";
}

function refresh(workId: string) {
  revalidatePath(`/admin/comics/${workId}`);
  revalidatePath(`/publisher/comics/${workId}`);
}

export async function getBonusOverview(comicId: string): Promise<BonusOverview> {
  const user = await requireActiveUser();
  const isAdmin = user.role === "ADMIN";

  let publisherId: string | null = null;
  if (!isAdmin) publisherId = (await assertComicPermission(user, comicId, "manageEditions")).publisherId;

  const [editions, labels] = await Promise.all([
    prisma.edition.findMany({
      where: { workId: comicId, deletedAt: null, status: { in: ["ACTIVE", "ARCHIVED", "PENDING_REVIEW"] } },
      select: { id: true, language: true, title: true, publisherId: true, publisher: { select: { name: true } } },
    }),
    getLanguageLabels(),
  ]);

  const labelOf = new Map(
    editions.map((edition) => [
      edition.id,
      `${edition.publisher.name} · ${labels[edition.language] ?? edition.language.toUpperCase()}${edition.title ? ` — ${edition.title}` : ""}`,
    ])
  );
  const manageable = new Set(editions.filter((edition) => isAdmin || edition.publisherId === publisherId).map((edition) => edition.id));
  const ids = editions.map((edition) => edition.id);

  const links = await prisma.editionBonus.findMany({
    where: {
      sourceEditionId: { in: ids },
      targetEditionId: { in: ids },
      ...(isAdmin ? {} : { OR: [{ sourceEditionId: { in: [...manageable] } }, { targetEditionId: { in: [...manageable] } }] }),
    },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { grants: true } } },
  });

  const now = new Date();
  return {
    editions: editions.map((edition) => ({
      id: edition.id,
      label: labelOf.get(edition.id) ?? edition.id,
      manageable: manageable.has(edition.id),
    })),
    bonuses: links.map((link) => ({
      id: link.id,
      sourceLabel: labelOf.get(link.sourceEditionId) ?? "—",
      targetLabel: labelOf.get(link.targetEditionId) ?? "—",
      trigger: link.trigger,
      isActive: link.isActive,
      name: link.name,
      startsAt: link.startsAt ? link.startsAt.toISOString() : null,
      endsAt: link.endsAt ? link.endsAt.toISOString() : null,
      note: link.note,
      grantCount: link._count.grants,
      canManage: manageable.has(link.targetEditionId) && (isAdmin || (!link.startsAt && !link.endsAt)),
      state: stateOf(link, now),
    })),
  };
}

export async function createBonus(input: {
  sourceEditionId: string;
  targetEditionId: string;
  trigger: BonusTrigger;
  name?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  note?: string;
  applyToExisting?: boolean;
}): Promise<ActionResult<{ id: string; granted: number }>> {
  try {
    const user = await requireActiveUser();
    const isAdmin = user.role === "ADMIN";

    if (!isBonusTrigger(input.trigger)) return { success: false, error: "شرط فعال‌سازی نامعتبر است" };
    if (input.sourceEditionId === input.targetEditionId) {
      return { success: false, error: "نسخه‌ی مبدأ و نسخه‌ی بونس نمی‌توانند یکی باشند" };
    }

    const [source, target] = await Promise.all([
      prisma.edition.findUnique({ where: { id: input.sourceEditionId }, select: { id: true, workId: true, deletedAt: true } }),
      prisma.edition.findUnique({ where: { id: input.targetEditionId }, select: { id: true, workId: true, deletedAt: true } }),
    ]);
    if (!source || !target || source.deletedAt || target.deletedAt) return { success: false, error: "نسخه یافت نشد" };
    if (source.workId !== target.workId) return { success: false, error: "هر دو نسخه باید متعلق به یک اثر باشند" };

    const startsAt = parseDate(input.startsAt);
    const endsAt = parseDate(input.endsAt);
    if (startsAt === "invalid" || endsAt === "invalid") return { success: false, error: "تاریخ نامعتبر است" };

    const campaign = Boolean(startsAt || endsAt);
    if (campaign && !isAdmin) return { success: false, error: "ساخت کمپین زمان‌دار فقط برای مدیریت ممکن است" };
    if (input.applyToExisting && !isAdmin) return { success: false, error: "اعمال روی خریدهای قبلی فقط برای مدیریت ممکن است" };
    if (startsAt && endsAt && endsAt <= startsAt) return { success: false, error: "تاریخ پایان باید بعد از تاریخ شروع باشد" };
    if (endsAt && endsAt <= new Date()) return { success: false, error: "تاریخ پایان باید در آینده باشد" };

    await requireEditionAccess(target.id, "manageEditions");

    if (!campaign) {
      const duplicate = await prisma.editionBonus.findFirst({
        where: { sourceEditionId: source.id, targetEditionId: target.id, startsAt: null, endsAt: null },
        select: { id: true },
      });
      if (duplicate) return { success: false, error: "این پیوند دائمی قبلاً ثبت شده است" };
    }

    const bonus = await prisma.editionBonus.create({
      data: {
        sourceEditionId: source.id,
        targetEditionId: target.id,
        trigger: input.trigger,
        name: input.name?.trim().slice(0, 80) || null,
        startsAt,
        endsAt,
        note: input.note?.trim().slice(0, 300) || null,
        createdById: user.id,
      },
      select: { id: true },
    });

    after(() =>
      logAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "edition.bonusCreate",
        targetType: "EditionBonus",
        targetId: bonus.id,
        metadata: {
          sourceEditionId: source.id,
          targetEditionId: target.id,
          trigger: input.trigger,
          startsAt: startsAt ? startsAt.toISOString() : null,
          endsAt: endsAt ? endsAt.toISOString() : null,
        },
      })
    );

    refresh(source.workId);

    let granted = 0;
    if (input.applyToExisting) {
      try {
        granted = (await applyBonusBackfill(bonus.id)).granted;
      } catch (err) {
        if (err instanceof BonusLimitError) {
          return { success: false, error: "پیوند ساخته شد اما حجم خریدهای قبلی برای اعمال یک‌جا زیاد است" };
        }
        throw err;
      }
    }

    return { success: true, data: { id: bonus.id, granted } };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      return { success: false, error: "این پیوند دائمی قبلاً ثبت شده است" };
    }
    return safeError(err);
  }
}

async function loadBonusForChange(id: string, user: SessionUser) {
  const link = await prisma.editionBonus.findUnique({
    where: { id },
    select: { id: true, targetEditionId: true, startsAt: true, endsAt: true, source: { select: { workId: true } } },
  });
  if (!link) throw new AccessDeniedError("پیوند بونس یافت نشد");
  if (user.role !== "ADMIN") {
    if (link.startsAt || link.endsAt) throw new AccessDeniedError("کمپین‌های زمان‌دار فقط توسط مدیریت قابل تغییر است");
    await requireEditionAccess(link.targetEditionId, "manageEditions");
  }
  return link;
}

export async function setBonusActive(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const user = await requireActiveUser();
    const link = await loadBonusForChange(id, user);

    await prisma.editionBonus.update({ where: { id }, data: { isActive: Boolean(isActive) } });

    after(() =>
      logAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "edition.bonusToggle",
        targetType: "EditionBonus",
        targetId: id,
        metadata: { isActive: Boolean(isActive) },
      })
    );

    refresh(link.source.workId);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function deleteBonus(id: string): Promise<ActionResult> {
  try {
    const user = await requireActiveUser();
    const link = await loadBonusForChange(id, user);

    await prisma.editionBonus.delete({ where: { id } });

    after(() =>
      logAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "edition.bonusDelete",
        targetType: "EditionBonus",
        targetId: id,
      })
    );

    refresh(link.source.workId);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function previewBonusBackfill(id: string): Promise<ActionResult<{ users: number; chapters: number; rows: number }>> {
  try {
    await requireAdmin();
    const plan = await planBonusBackfill(id);
    if (!plan) return { success: false, error: "پیوند بونس یافت نشد" };
    return { success: true, data: { users: plan.users, chapters: plan.chapters, rows: plan.rows } };
  } catch (err) {
    return safeError(err);
  }
}

export async function runBonusBackfill(id: string): Promise<ActionResult<{ users: number; granted: number }>> {
  try {
    const admin = await requireAdmin();
    const link = await prisma.editionBonus.findUnique({ where: { id }, select: { source: { select: { workId: true } } } });
    if (!link) return { success: false, error: "پیوند بونس یافت نشد" };

    const result = await applyBonusBackfill(id);

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "edition.bonusBackfill",
        targetType: "EditionBonus",
        targetId: id,
        metadata: result,
      })
    );

    refresh(link.source.workId);
    return { success: true, data: result };
  } catch (err) {
    if (err instanceof BonusLimitError) {
      return { success: false, error: "حجم خریدهای قبلی برای اعمال یک‌جا زیاد است؛ دسترسی‌ها را با هدیه‌ی دسته‌ای بدهید" };
    }
    return safeError(err);
  }
}