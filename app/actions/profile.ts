"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { sanitizeCustomLinks, isSafeUrl, type ProfileLink } from "@/lib/profile-links";
import { isAllowedImageUrl } from "@/lib/image-url";

export async function updateProfileDetails(input: {
  bio?: string;
  avatarUrl?: string;
  donationLink?: string;
  cryptoWalletLabel?: string;
  cryptoWalletAddress?: string;
  customLinks?: ProfileLink[];
}): Promise<{ success: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) {
    return { success: false, error: "برای ویرایش پروفایل باید وارد شوید" };
  }

  const avatarUrl = input.avatarUrl?.trim();
  if (avatarUrl && !isAllowedImageUrl(avatarUrl)) {
    return { success: false, error: "آدرس تصویر معتبر نیست — از گزینه آپلود مستقیم استفاده کنید" };
  }

  const donationLink = input.donationLink?.trim();
  if (donationLink && !isSafeUrl(donationLink)) {
    return { success: false, error: "لینک دونیت معتبر نیست" };
  }

  const customLinks = sanitizeCustomLinks(input.customLinks ?? []) as unknown as Prisma.InputJsonValue;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      bio: input.bio?.trim().slice(0, 500) || null,
      avatarUrl: avatarUrl || null,
      donationLink: donationLink || null,
      cryptoWalletLabel: input.cryptoWalletLabel?.trim().slice(0, 60) || null,
      cryptoWalletAddress: input.cryptoWalletAddress?.trim().slice(0, 200) || null,
      customLinks,
    },
  });

  revalidatePath("/app/profile");
  revalidatePath(`/app/team/${user.id}`);

  return { success: true };
}