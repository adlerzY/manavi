import Link from "next/link";
import { getSessionUser, getPublisherContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { EditProfileForm } from "@/components/profile/edit-profile-form";
import { AgeVerificationToggle } from "@/components/profile/age-verification-toggle";
import { ReferralCard } from "@/components/gamification/referral-card";
import { ComicCard } from "@/components/catalog/comic-card";
import { SafeAvatar } from "@/components/ui/safe-avatar";
import { SafeCoverImage } from "@/components/ui/safe-cover-image";
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

  const [bookmarks, readHistory, referralRewardCoins, publisherContext, showEarnings] = await Promise.all([
    prisma.bookmark.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { comic: { select: { slug: true, title: true, coverImage: true } } },
    }),
    prisma.readHistory.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: { comic: { select: { slug: true, title: true, coverImage: true } } },
    }),
    getReferralRewardCoins(),
    getPublisherContext(user),
    hasEarningsAccess(user),
  ]);

  const showAdminPanel = user.role === "ADMIN" && !user.isBanned;
  const showPublisherPanel = Boolean(publisherContext) && !user.isBanned;
  const avatarUploadAllowed = canUploadAvatar(user);

  const seedComicIds = Array.from(
    new Set([...readHistory.map((h) => h.comicId), ...bookmarks.map((b) => b.comicId)])
  );

  const recommendations = seedComicIds.length
    ? await prisma.comic.findMany({
        where: {
          id: { notIn: seedComicIds },
          genres: {
            some: {
              genre: {
                comics: { some: { comicId: { in: seedComicIds } } },
              },
            },
          },
        },
        orderBy: { bookmarks: { _count: "desc" } },
        take: 8,
        select: {
          id: true,
          title: true,
          slug: true,
          coverImage: true,
          dominantColor: true,
          chapters: {
            where: { publishedAt: { not: null } },
            orderBy: { chapterNumber: "desc" },
            take: 1,
            select: { chapterNumber: true },
          },
        },
      })
    : [];

  const referralLink = getReferralLink(user.referralCode);

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-10">
        <div className="flex items-center gap-4">
          <SafeAvatar src={user.avatarUrl ?? user.telegramPhotoUrl} fallbackText={user.firstName} size={64} />
          <div>
            <h1 className="text-lg font-semibold text-text-main">
              {user.firstName} {user.lastName ?? ""}
            </h1>
            <p className="text-sm text-text-muted">موجودی سکه: {user.coinsBalance.toLocaleString("fa-IR")}</p>
            {user.role !== "USER" && (
              <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
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

        <section>
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

        <section>
          <ReferralCard
            referralLink={referralLink}
            referralCode={user.referralCode}
            referralCount={user.referralCount}
            rewardCoins={referralRewardCoins}
          />
        </section>

        {showEarnings && (
          <section>
            <Link
              href="/app/earnings"
              className="block rounded-md border border-border bg-surface px-4 py-3 text-center text-sm text-text-main hover:border-primary"
            >
              درآمد و تسویه‌حساب‌های من
            </Link>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-sm font-medium text-text-main">تنظیمات محتوا</h2>
          <AgeVerificationToggle current={user.isAgeVerified} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-text-main">ادامه مطالعه</h2>
          <div className="space-y-2">
            {readHistory.map((entry) => (
              <Link
                key={entry.comicId}
                href={`/app/read/${entry.lastChapterId}`}
                className="flex items-center gap-3 rounded-md border border-border bg-surface p-2"
              >
                <div className="relative h-14 w-10 flex-shrink-0 overflow-hidden rounded">
                  <SafeCoverImage src={entry.comic.coverImage} alt={entry.comic.title} fill className="object-cover" />
                </div>
                <span className="text-sm text-text-main">{entry.comic.title}</span>
              </Link>
            ))}
            {readHistory.length === 0 && <p className="text-sm text-text-muted">هنوز چیزی نخوانده‌اید.</p>}
          </div>
        </section>

        {recommendations.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-medium text-text-main">پیشنهاد برای شما</h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
              {recommendations.map((comic) => (
                <ComicCard
                  key={comic.id}
                  slug={comic.slug}
                  title={comic.title}
                  coverImage={comic.coverImage}
                  dominantColor={comic.dominantColor}
                  latestChapter={comic.chapters[0]?.chapterNumber ?? null}
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-sm font-medium text-text-main">بوکمارک‌ها</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {bookmarks.map((b) => (
              <Link key={b.comicId} href={`/app/comic/${b.comic.slug}`} className="block">
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-surface">
                  <SafeCoverImage src={b.comic.coverImage} alt={b.comic.title} fill className="object-cover" />
                </div>
                <p className="mt-1 truncate text-xs text-text-main">{b.comic.title}</p>
              </Link>
            ))}
            {bookmarks.length === 0 && <p className="text-sm text-text-muted">بوکمارکی ثبت نشده است.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}