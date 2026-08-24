"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { sanitizeCustomLinks, type ProfileLink } from "@/lib/profile-links";
import { isAllowedImageUrl } from "@/lib/image-url";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export async function updatePublisherProfile(input: {
  bio?: string;
  avatarUrl?: string;
  telegramUrl?: string;
  instagramUrl?: string;
  websiteUrl?: string;
  donationLink?: string;
  cryptoWalletLabel?: string;
  cryptoWalletAddress?: string;
  customLinks?: ProfileLink[];
}): Promise<ActionResult> {
  try {
    const user = await getSessionUser();
    if (!user?.publisherProfile) {
      return { success: false, error: "پروفایل ناشر یافت نشد" };
    }

    const avatarUrl = input.avatarUrl?.trim();
    if (avatarUrl && !isAllowedImageUrl(avatarUrl)) {
      return { success: false, error: "آدرس تصویر معتبر نیست — از گزینه آپلود مستقیم استفاده کنید" };
    }

    const customLinks = sanitizeCustomLinks(input.customLinks ?? []) as unknown as Prisma.InputJsonValue;

    await prisma.publisher.update({
      where: { id: user.publisherProfile.id },
      data: {
        bio: input.bio?.trim() || null,
        avatarUrl: avatarUrl || null,
        telegramUrl: input.telegramUrl?.trim() || null,
        instagramUrl: input.instagramUrl?.trim() || null,
        websiteUrl: input.websiteUrl?.trim() || null,
        donationLink: input.donationLink?.trim() || null,
        cryptoWalletLabel: input.cryptoWalletLabel?.trim().slice(0, 60) || null,
        cryptoWalletAddress: input.cryptoWalletAddress?.trim().slice(0, 200) || null,
        customLinks,
      },
    });

    revalidatePath("/publisher/profile");
    revalidatePath(`/app/publisher/${user.publisherProfile.id}`);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}