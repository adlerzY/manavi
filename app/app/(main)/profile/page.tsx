import Link from "next/link";
import { Award, Coins, Info, Library, Trophy, Wallet } from "lucide-react";
import { getSessionUser, getPublisherContext } from "@/lib/auth";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { EditProfileForm } from "@/components/profile/edit-profile-form";
import { AgeVerificationToggle } from "@/components/profile/age-verification-toggle";
import { ProfileIconLink } from "@/components/profile/profile-icon-link";
import { SettingsSheet } from "@/components/profile/settings-sheet";
import { LeaderboardVisibilityToggle } from "@/components/profile/leaderboard-visibility-toggle";
import { ReferralSheet } from "@/components/profile/referral-sheet";
import { GuideLauncher } from "@/components/guide/guide-launcher";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { SafeAvatar } from "@/components/ui/safe-avatar";
import { Mascot } from "@/components/ui/mascot";
import { TelegramOnlyNotice } from "@/components/ui/telegram-only-notice";
import { getReferralLink } from "@/lib/site-config";
import { parseCustomLinks } from "@/lib/profile-links";
import { getReferralRewardCoins } from "@/lib/platform-settings";
import { ROLE_LABELS, canUploadAvatar, hasEarningsAccess } from "@/lib/roles";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { titleLabel } from "@/lib/achievements";

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) {
    return <TelegramOnlyNotice message="برای دیدن پروفایل، ماناوی رو از داخل تلگرام باز کن." />;
  }

  const [referralRewardCoins, publisherContext, showEarnings, unreadCount] = await Promise.all([
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
    <main className="flex flex-1 flex-col overflow-hidden bg-background px-4 pb-3 pt-3">
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-3">
        <header className="flex flex-shrink-0 items-center gap-3">
          <SafeAvatar src={user.avatarUrl ?? user.telegramPhotoUrl} fallbackText={user.firstName} size={52} />
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
          <div className="flex flex-shrink-0 items-center gap-2">
            <NotificationBell
              initialUnread={unreadCount}
              buttonClassName="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-text-main"
            />
            <SettingsSheet>
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
            </SettingsSheet>
          </div>
        </header>

        <div className="flex flex-shrink-0 items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
          <div>
            <p className="text-xs text-text-muted">موجودی سکه</p>
            <p className="mt-0.5 text-lg font-semibold text-primary">🪙 {user.coinsBalance.toLocaleString("fa-IR")}</p>
          </div>
          <Link
            href="/app/shop"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            شارژ سکه
          </Link>
        </div>

        {(showAdminPanel || showPublisherPanel) && (
          <div className="flex flex-shrink-0 gap-2">
            {showAdminPanel && (
              <Link
                href="/admin"
                className="flex-1 rounded-xl bg-primary px-3 py-2.5 text-center text-sm font-medium text-primary-foreground"
              >
                پنل مدیریت
              </Link>
            )}
            {showPublisherPanel && (
              <Link
                href="/publisher"
                className="flex-1 rounded-xl border border-primary px-3 py-2.5 text-center text-sm font-medium text-primary"
              >
                پنل ناشر
              </Link>
            )}
          </div>
        )}

        <div className="grid flex-shrink-0 grid-cols-3 gap-2">
          <ProfileIconLink href="/app/library" icon={<Library size={18} />} label="کتابخانه" />
          <ProfileIconLink href="/app/wallet" icon={<Wallet size={18} />} label="کیف پول" />
          <ProfileIconLink href="/app/achievements" icon={<Award size={18} />} label="دستاوردها" />
          <ProfileIconLink href="/app/leaderboard" icon={<Trophy size={18} />} label="رتبه‌بندی" />
          {showEarnings && <ProfileIconLink href="/app/earnings" icon={<Coins size={18} />} label="درآمد" />}
          <GuideLauncher guide="app-tour" label="راهنما" icon={<Info size={18} />} />
        </div>

        <div className="relative min-h-0 flex-1">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ backgroundImage: "radial-gradient(ellipse at center, rgba(0,220,100,0.12), transparent 65%)" }}
          />
          <Mascot pose="reading" fluid className="absolute inset-0" />
        </div>

        <ReferralSheet
          referralLink={referralLink}
          referralCode={user.referralCode}
          referralCount={user.referralCount}
          rewardCoins={referralRewardCoins}
        />
      </div>
    </main>
  );
}