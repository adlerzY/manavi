import Link from "next/link";
import { Award, Bell, Coins, Gift, Library, Settings, Trophy, Wallet } from "lucide-react";
import { getSessionUser, getPublisherContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { Disclosure } from "@/components/ui/disclosure";
import { EditProfileForm } from "@/components/profile/edit-profile-form";
import { AgeVerificationToggle } from "@/components/profile/age-verification-toggle";
import { ProfileMenuLink } from "@/components/profile/profile-menu-link";
import { LeaderboardVisibilityToggle } from "@/components/profile/leaderboard-visibility-toggle";
import { ReferralCard } from "@/components/gamification/referral-card";
import { SafeAvatar } from "@/components/ui/safe-avatar";
import { getReferralLink } from "@/lib/site-config";
import { parseCustomLinks } from "@/lib/profile-links";
import { getReferralRewardCoins } from "@/lib/platform-settings";
import { ROLE_LABELS, canUploadAvatar, hasEarningsAccess } from "@/lib/roles";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { titleLabel } from "@/lib/achievements";

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <p className="text-sm text-text-muted">برای مشاهده پروفایل، این صفحه را از داخل تلگرام باز کنید.</p>
      </main>
    );
  }

  const [readingCount, referralRewardCoins, publisherContext, showEarnings, unreadCount] = await Promise.all([
    prisma.readHistory.count({ where: { userId: user.id } }),
    getReferralRewardCoins(),
    getPublisherContext(user),
    hasEarningsAccess(user),
    getUnreadNotificationCount(user.id),
  ]);

  const showAdminPanel = user.role === "ADMIN" && !user.isBanned;
  const showPublisherPanel = Boolean(publisherContext) && !user.isBanned;
  const avatarUploadAllowed = canUploadAvatar(user);
  const referralLink = getReferralLink(user.referralCode);
  const activeTitle = titleLabel(user.activeTitle);

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="flex items-center gap-3">
          <SafeAvatar src={user.avatarUrl ?? user.telegramPhotoUrl} fallbackText={user.firstName} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-text-main">
              {user.firstName} {user.lastName ?? ""}
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
              {user.username && <span>@{user.username}</span>}
              {user.role !== "USER" && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">{ROLE_LABELS[user.role]}</span>
              )}
              {activeTitle && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">{activeTitle}</span>}
            </p>
          </div>
        </header>

        <div className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
          <div>
            <p className="text-xs text-text-muted">موجودی سکه</p>
            <p className="mt-0.5 text-lg font-semibold text-primary">🪙 {user.coinsBalance.toLocaleString("fa-IR")}</p>
          </div>
          <Link
            href="/app/shop"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            شارژ سکه
          </Link>
        </div>

        {(showAdminPanel || showPublisherPanel) && (
          <div className="flex gap-2">
            {showAdminPanel && (
              <Link
                href="/admin"
                className="flex-1 rounded-md bg-primary px-3 py-2.5 text-center text-sm font-medium text-primary-foreground"
              >
                پنل مدیریت
              </Link>
            )}
            {showPublisherPanel && (
              <Link
                href="/publisher"
                className="flex-1 rounded-md border border-primary px-3 py-2.5 text-center text-sm font-medium text-primary"
              >
                پنل ناشر
              </Link>
            )}
          </div>
        )}

        <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
          <ProfileMenuLink
            href="/app/library"
            icon={<Library size={18} />}
            title="کتابخانه من"
            meta={readingCount > 0 ? `${readingCount.toLocaleString("fa-IR")} اثر` : undefined}
          />
          <ProfileMenuLink
            href="/app/notifications"
            icon={<Bell size={18} />}
            title="اعلان‌ها"
            meta={unreadCount > 0 ? `${unreadCount.toLocaleString("fa-IR")} جدید` : undefined}
            highlight={unreadCount > 0}
          />
          <ProfileMenuLink href="/app/wallet" icon={<Wallet size={18} />} title="تاریخچه‌ی کیف پول" />
          <ProfileMenuLink href="/app/achievements" icon={<Award size={18} />} title="دستاوردها و تگ‌ها" />
          <ProfileMenuLink href="/app/leaderboard" icon={<Trophy size={18} />} title="رتبه‌بندی ناشران و تیم‌ها" />
          {showEarnings && <ProfileMenuLink href="/app/earnings" icon={<Coins size={18} />} title="درآمد و تسویه‌حساب" />}
        </div>

        <Disclosure title="تنظیمات" subtitle="محتوای ۱۸+ و ویرایش پروفایل" icon={<Settings size={18} />}>
          <AgeVerificationToggle current={user.isAgeVerified} />
          {showEarnings && <LeaderboardVisibilityToggle current={user.leaderboardHidden} />}
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
        </Disclosure>

        <Disclosure
          title="دعوت دوستان"
          subtitle={`${user.referralCount.toLocaleString("fa-IR")} دعوت موفق`}
          icon={<Gift size={18} />}
        >
          <ReferralCard
            referralLink={referralLink}
            referralCode={user.referralCode}
            referralCount={user.referralCount}
            rewardCoins={referralRewardCoins}
          />
        </Disclosure>
      </div>
    </main>
  );
}