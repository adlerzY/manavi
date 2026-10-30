import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getAllowedAgeRatings } from "@/lib/content-filter";
import { isEligibleDonationReceiver } from "@/lib/donations";
import { parseCustomLinks, type ProfileLink } from "@/lib/profile-links";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";
import { titleLabel } from "@/lib/achievements";
import { DonateButton } from "@/components/team/donate-button";
import { BackButton } from "@/components/navigation/back-button";
import { ProfileLinkChips } from "@/components/support/profile-link-chips";
import { HomeComicCard } from "@/components/catalog/home-comic-card";
import { ExpandableText } from "@/components/ui/expandable-text";
import { SafeAvatar } from "@/components/ui/safe-avatar";

interface PageProps {
  params: Promise<{ userId: string }>;
}

export default async function TeamProfilePage({ params }: PageProps) {
  const { userId } = await params;

  const [sessionUser, allowedRatings] = await Promise.all([getSessionUser(), getAllowedAgeRatings()]);

  const profileUser = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      bio: true,
      avatarUrl: true,
      telegramPhotoUrl: true,
      donationLink: true,
      customLinks: true,
      activeTitle: true,
      staffRoles: {
        where: { comic: { approvalStatus: "APPROVED", ageRating: { in: allowedRatings } } },
        select: { roleTitle: true, comic: { select: { id: true, title: true, slug: true, coverImage: true } } },
      },
    },
  });

  if (!profileUser) {
    notFound();
  }

  const isOwnProfile = sessionUser?.id === profileUser.id;

  const [chapterCounts, canReceive] = await Promise.all([
    prisma.chapterStaff.groupBy({
      by: ["roleTitle"],
      where: { userId: profileUser.id, chapter: { publishedAt: { not: null } } },
      _count: { _all: true },
    }),
    isOwnProfile ? Promise.resolve(false) : isEligibleDonationReceiver(profileUser.id),
  ]);

  const comicsById = new Map<string, { id: string; title: string; slug: string; coverImage: string; roles: string[] }>();
  for (const entry of profileUser.staffRoles) {
    const existing = comicsById.get(entry.comic.id);
    if (existing) {
      if (!existing.roles.includes(entry.roleTitle)) existing.roles.push(entry.roleTitle);
    } else {
      comicsById.set(entry.comic.id, { ...entry.comic, roles: [entry.roleTitle] });
    }
  }
  const comics = [...comicsById.values()];

  const links: ProfileLink[] = [{ label: "حمایت خارجی", url: profileUser.donationLink }]
    .filter((item): item is ProfileLink => Boolean(item.url))
    .concat(parseCustomLinks(profileUser.customLinks));

  const title = titleLabel(profileUser.activeTitle);

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <BackButton fallbackHref="/app" variant="plain" />

        <header className="flex items-center gap-3">
          <SafeAvatar src={profileUser.avatarUrl ?? profileUser.telegramPhotoUrl} fallbackText={profileUser.firstName} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-text-main">
              {profileUser.firstName} {profileUser.lastName ?? ""}
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
              {profileUser.username && <span>@{profileUser.username}</span>}
              {title && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">{title}</span>}
            </p>
          </div>
          {canReceive && (
            <DonateButton
              receiverId={profileUser.id}
              authenticated={Boolean(sessionUser)}
              receiverName={profileUser.firstName}
            />
          )}
          {isOwnProfile && (
            <Link href="/app/profile" className="flex-shrink-0 text-xs text-primary underline">
              ویرایش پروفایل
            </Link>
          )}
        </header>

        {profileUser.bio && <ExpandableText text={profileUser.bio} />}

        {chapterCounts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chapterCounts.map((count) => (
              <span key={count.roleTitle} className="rounded-full bg-surface px-3 py-1.5 text-xs text-text-main">
                {STAFF_ROLE_LABELS[count.roleTitle]} · {count._count._all.toLocaleString("fa-IR")} چپتر
              </span>
            ))}
          </div>
        )}

        <ProfileLinkChips links={links} />

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text-main">پروژه‌ها</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {comics.map((comic) => (
              <HomeComicCard
                key={comic.id}
                slug={comic.slug}
                title={comic.title}
                coverImage={comic.coverImage}
                latestChapter={null}
                badgeLabel={STAFF_ROLE_LABELS[comic.roles[0] as keyof typeof STAFF_ROLE_LABELS]}
              />
            ))}
            {comics.length === 0 && <p className="col-span-full text-sm text-text-muted">هنوز پروژه‌ای ثبت نشده است.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}