import { NextRequest, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateTelegramInitData, InvalidInitDataError, sanitizeTelegramPhotoUrl } from "@/lib/telegram";
import { createSessionToken, sessionCookieOptions } from "@/lib/session";
import { generateReferralCode } from "@/lib/referral";
import { checkRateLimit } from "@/lib/moderation";
import type { Role } from "@prisma/client";

function getBootstrapAdminTelegramIds(): Set<string> {
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
  const meta = (err as { meta?: { target?: string[] | string } }).meta;
  if (!meta?.target) return undefined;
  return Array.isArray(meta.target) ? meta.target : [meta.target];
}

async function createUserWithReferral(input: {
  telegramId: bigint;
  firstName: string;
  lastName: string | null;
  username: string | null;
  telegramPhotoUrl: string | null;
  referrerId: string | null;
  role: Role;
}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const referralCode = generateReferralCode();
    try {
      return await prisma.user.create({
        data: {
          telegramId: input.telegramId,
          firstName: input.firstName,
          lastName: input.lastName,
          username: input.username,
          telegramPhotoUrl: input.telegramPhotoUrl,
          role: input.role,
          referralCode,
          referredById: input.referrerId,
        },
      });
    } catch (err) {
      const code = prismaErrorCode(err);
      const target = prismaErrorTarget(err);

      if (code === "P2002" && target?.includes("telegramId")) {
        const existing = await prisma.user.findUnique({ where: { telegramId: input.telegramId } });
        if (existing) return existing;
      }

      if (code === "P2002" && target?.includes("referralCode") && attempt < 4) {
        continue;
      }

      throw err;
    }
  }
  throw new Error("Failed to allocate a unique referral code");
}

export async function POST(req: NextRequest) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const allowed = await checkRateLimit(`auth-telegram:${ip}`, 20);
  if (!allowed) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  let initData: unknown;
  try {
    const body = await req.json();
    initData = body.initData;
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  if (!initData || typeof initData !== "string") {
    return NextResponse.json({ error: "initData is required" }, { status: 400 });
  }

  let validated;
  try {
    validated = await validateTelegramInitData(initData);
  } catch (err) {
    if (err instanceof InvalidInitDataError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const { user, startParam } = validated;
  const telegramPhotoUrl = sanitizeTelegramPhotoUrl(user.photo_url);

  const existing = await prisma.user.findUnique({ where: { telegramId: BigInt(user.id) } });
  const bootstrapAdmins = getBootstrapAdminTelegramIds();

  let dbUser;
  if (existing) {
    const shouldPromote = existing.role !== "ADMIN" && bootstrapAdmins.has(String(user.id));

    dbUser = await prisma.user.update({
      where: { id: existing.id },
      data: {
        firstName: user.first_name,
        lastName: user.last_name ?? null,
        username: user.username ?? null,
        telegramPhotoUrl,
        ...(shouldPromote ? { role: "ADMIN" as Role } : {}),
      },
    });
  } else {
    const referrer = startParam
      ? await prisma.user.findUnique({ where: { referralCode: startParam } })
      : null;

    const role: Role = bootstrapAdmins.has(String(user.id)) ? "ADMIN" : "USER";

    dbUser = await createUserWithReferral({
      telegramId: BigInt(user.id),
      firstName: user.first_name,
      lastName: user.last_name ?? null,
      username: user.username ?? null,
      telegramPhotoUrl,
      referrerId: referrer?.id ?? null,
      role,
    });
  }

  const sessionToken = createSessionToken(dbUser.id);
  const cookieStore = await cookies();
  cookieStore.set("session", sessionToken, sessionCookieOptions());

  return NextResponse.json({
    user: {
      id: dbUser.id,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      username: dbUser.username,
      role: dbUser.role,
    },
  });
}