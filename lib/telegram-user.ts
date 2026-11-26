import "server-only";
import type { Role, User } from "@prisma/client";
import { prisma } from "./prisma";
import { generateReferralCode } from "./referral";
import { invalidateSessionUserCache } from "./auth";

export interface TelegramIdentity {
  telegramId: bigint;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl?: string | null;
  startParam?: string | null;
}

export class AccountDeletedError extends Error {
  constructor() {
    super("account deleted");
    this.name = "AccountDeletedError";
  }
}

function bootstrapAdminIds(): Set<string> {
  const raw = process.env.ADMIN_BOOTSTRAP_TELEGRAM_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

function prismaErrorCode(err: unknown): string | undefined {
  return err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : undefined;
}

function prismaErrorTarget(err: unknown): string[] | undefined {
  if (!err || typeof err !== "object" || !("meta" in err)) return undefined;
  const target = (err as { meta?: { target?: string[] | string } }).meta?.target;
  if (!target) return undefined;
  return Array.isArray(target) ? target : [target];
}

async function createUser(identity: TelegramIdentity, role: Role, referrerId: string | null): Promise<User> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.user.create({
        data: {
          telegramId: identity.telegramId,
          firstName: identity.firstName,
          lastName: identity.lastName,
          username: identity.username,
          telegramPhotoUrl: identity.photoUrl ?? null,
          role,
          referralCode: generateReferralCode(),
          referredById: referrerId,
        },
      });
    } catch (err) {
      const code = prismaErrorCode(err);
      const target = prismaErrorTarget(err);

      if (code === "P2002" && target?.includes("telegramId")) {
        const existing = await prisma.user.findUnique({ where: { telegramId: identity.telegramId } });
        if (existing) return existing;
      }
      if (code === "P2002" && target?.includes("referralCode") && attempt < 4) continue;
      throw err;
    }
  }
  throw new Error("Failed to allocate a unique referral code");
}

export async function findOrCreateTelegramUser(identity: TelegramIdentity): Promise<User> {
  const isBootstrapAdmin = bootstrapAdminIds().has(identity.telegramId.toString());
  const existing = await prisma.user.findUnique({ where: { telegramId: identity.telegramId } });

  if (existing) {
    if (existing.deletedAt) throw new AccountDeletedError();

    const promote = isBootstrapAdmin && existing.role !== "ADMIN";
    const photo = identity.photoUrl === undefined ? existing.telegramPhotoUrl : identity.photoUrl;
    const changed =
      promote ||
      existing.firstName !== identity.firstName ||
      existing.lastName !== identity.lastName ||
      existing.username !== identity.username ||
      existing.telegramPhotoUrl !== photo;

    if (!changed) return existing;

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        firstName: identity.firstName,
        lastName: identity.lastName,
        username: identity.username,
        telegramPhotoUrl: photo,
        ...(promote ? { role: "ADMIN" as Role } : {}),
      },
    });
    await invalidateSessionUserCache(updated.id);
    return updated;
  }

  const referrer = identity.startParam
    ? await prisma.user.findUnique({ where: { referralCode: identity.startParam }, select: { id: true } })
    : null;

  return createUser(identity, isBootstrapAdmin ? "ADMIN" : "USER", referrer?.id ?? null);
}