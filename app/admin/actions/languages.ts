"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { safeError, type ActionResult } from "@/lib/errors";
import { logAuditEvent } from "@/lib/audit-log";
import { LANGUAGES_TAG } from "@/lib/language-registry";

const CODE_PATTERN = /^[a-z]{2,5}$/;

export interface LanguageRow {
  code: string;
  label: string;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  editionCount: number;
}

function refresh() {
  revalidateTag(LANGUAGES_TAG, "max");
  revalidatePath("/admin/categories");
  revalidatePath("/app/explore");
}

export async function listLanguages(): Promise<LanguageRow[]> {
  await requireAdmin();

  const [languages, counts] = await Promise.all([
    prisma.language.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    prisma.edition.groupBy({ by: ["language"], where: { deletedAt: null }, _count: { _all: true } }),
  ]);
  const countByCode = new Map(counts.map((entry) => [entry.language, entry._count._all]));

  return languages.map((language) => ({
    code: language.code,
    label: language.label,
    isActive: language.isActive,
    isDefault: language.isDefault,
    sortOrder: language.sortOrder,
    editionCount: countByCode.get(language.code) ?? 0,
  }));
}

export async function createLanguage(input: { code: string; label: string; sortOrder?: number }): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    const code = input.code.trim().toLowerCase();
    const label = input.label.trim().slice(0, 40);
    if (!CODE_PATTERN.test(code)) return { success: false, error: "کد زبان باید ۲ تا ۵ حرف کوچک انگلیسی باشد (مثلاً de)" };
    if (!label) return { success: false, error: "نام نمایشی زبان الزامی است" };

    const exists = await prisma.language.findUnique({ where: { code }, select: { code: true } });
    if (exists) return { success: false, error: "این زبان قبلاً ثبت شده است" };

    const sortOrder = Number.isInteger(input.sortOrder) ? Number(input.sortOrder) : (await prisma.language.count()) + 1;
    await prisma.language.create({ data: { code, label, sortOrder } });

    after(() =>
      logAuditEvent({ actorId: admin.id, actorRole: admin.role, action: "language.create", targetType: "Language", targetId: code, metadata: { label } })
    );

    refresh();
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function updateLanguage(
  code: string,
  input: { label: string; isActive: boolean; sortOrder: number }
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    const label = input.label.trim().slice(0, 40);
    if (!label) return { success: false, error: "نام نمایشی زبان الزامی است" };
    if (!Number.isInteger(input.sortOrder)) return { success: false, error: "ترتیب نمایش نامعتبر است" };

    const current = await prisma.language.findUnique({ where: { code } });
    if (!current) return { success: false, error: "زبان یافت نشد" };
    if (current.isDefault && !input.isActive) {
      return { success: false, error: "زبان پیش‌فرض را نمی‌توان غیرفعال کرد؛ ابتدا زبان پیش‌فرض دیگری انتخاب کنید" };
    }

    await prisma.language.update({ where: { code }, data: { label, isActive: Boolean(input.isActive), sortOrder: input.sortOrder } });

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "language.update",
        targetType: "Language",
        targetId: code,
        metadata: { label, isActive: Boolean(input.isActive), sortOrder: input.sortOrder },
      })
    );

    refresh();
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function setDefaultLanguage(code: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    const target = await prisma.language.findUnique({ where: { code } });
    if (!target) return { success: false, error: "زبان یافت نشد" };
    if (!target.isActive) return { success: false, error: "ابتدا زبان را فعال کنید" };

    await prisma.$transaction([
      prisma.language.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
      prisma.language.update({ where: { code }, data: { isDefault: true } }),
    ]);

    after(() =>
      logAuditEvent({ actorId: admin.id, actorRole: admin.role, action: "language.default", targetType: "Language", targetId: code })
    );

    refresh();
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}