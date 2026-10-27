import Link from "next/link";
import { Library, Wallet } from "lucide-react";
import { getSessionUser, getPublisherContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { EditProfileForm } from "@/components/profile/edit-profile-form";
import { AgeVerificationToggle } from "@/components/profile/age-verification-toggle";
import { ProfileMenuLink } from "@/components/profile/profile-menu-link";
import { ReferralCard } from "@/components/gamification/referral-card";
import { SafeAvatar } from "@/components/ui/safe-avatar";
import { getReferralLink } from "@/lib/site-config";
import { parseCustomLinks } from "@/lib/profile-links";
import { getReferralRewardCoins } from "@/lib/platform-settings";
import { ROLE_LABELS, canUploadAvatar, hasEarningsAccess } from "@/lib/roles";

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <p className="text-sm text-text-muted">برای مشاهده پروفایل، این صفحه را از داخل تلگرام باز کنید.</p>
      </main>
    );
  }

  const [bookmarkCount, readingCount, referralRewardCoins, publisherContext, showEarnings] = await Promise.all([
    prisma.bookmark.count({ where: { userId: user.id } }),
    prisma.readHistory.count({ where: { userId: user.id } }),
    getReferralRewardCoins(),
    getPublisherContext(user),
    hasEarningsAccess(user),
  ]);

  const showAdminPanel = user.role === "ADMIN" && !user.isBanned;
  const showPublisherPanel = Boolean(publisherContext) && !user.isBanned;
  const avatarUploadAllowed = canUploadAvatar(user);
  const referralLink = getReferralLink(user.referralCode);

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="flex items-center gap-4">
          <SafeAvatar src={user.avatarUrl ?? user.telegramPhotoUrl} fallbackText={user.firstName} size={64} />
          <div>
            <h1 className="text-lg font-semibold text-text-main">
              {user.firstName} {user.lastName ?? ""}
            </h1>
            {user.username && <p className="text-sm text-text-muted">@{user.username}</p>}
            {user.role !== "USER" && (
              <span className="mt-1 inline-block rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                {ROLE_LABELS[user.role]}
              </span>
            )}
          </div>
        </div>

        {(showAdminPanel || showPublisherPanel) && (
          <section className="space-y-2">
            {showAdminPanel && (
              <Link
                href="/admin"
                className="block rounded-md bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground"
              >
                ورود به پنل مدیریت
              </Link>
            )}
            {showPublisherPanel && (
              <Link
                href="/publisher"
                className="block rounded-md border border-primary px-4 py-3 text-center text-sm font-medium text-primary"
              >
                ورود به پنل ناشر
              </Link>
            )}
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-text-main">حساب من</h2>
          <ProfileMenuLink
            href="/app/library"
            icon={<Library size={20} />}
            title="کتابخانه من"
            subtitle={`${readingCount.toLocaleString("fa-IR")} اثر در حال مطالعه · ${bookmarkCount.toLocaleString("fa-IR")} علاقه‌مندی`}
          />
          <ProfileMenuLink
            href="/app/wallet"
            icon={<Wallet size={20} />}
            title="کیف پول"
            subtitle={`موجودی: ${user.coinsBalance.toLocaleString("fa-IR")} سکه · تاریخچه تراکنش‌ها`}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text-main">تنظیمات</h2>
          <AgeVerificationToggle current={user.isAgeVerified} />
          <CollapsibleSection triggerLabel="ویرایش پروفایل">
            <EditProfileForm
              canUploadAvatar={avatarUploadAllowed}
              initialBio={user.bio}
              initialAvatarUrl={user.avatarUrl}
              initialDonationLink={user.donationLink}
              initialCryptoWalletLabel={user.cryptoWalletLabel}
              initialCryptoWalletAddress={user.cryptoWalletAddress}
              initialCustomLinks={parseCustomLinks(user.customLinks)}
            />
          </CollapsibleSection>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text-main">فعالیت و امکانات دیگر</h2>
          <ReferralCard
            referralLink={referralLink}
            referralCode={user.referralCode}
            referralCount={user.referralCount}
            rewardCoins={referralRewardCoins}
          />
          {showEarnings && (
            <Link
              href="/app/earnings"
              className="block rounded-md border border-border bg-surface px-4 py-3 text-center text-sm text-text-main hover:border-primary"
            >
              درآمد و تسویه‌حساب‌های من
            </Link>
          )}
        </section>
      </div>
    </main>
  );
}