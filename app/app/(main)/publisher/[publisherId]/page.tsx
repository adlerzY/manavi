import { notFound } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getAllowedAgeRatings } from "@/lib/content-filter";
import { isEligibleDonationReceiver } from "@/lib/donations";
import { parseCustomLinks, type ProfileLink } from "@/lib/profile-links";
import { DonateButton } from "@/components/team/donate-button";
import { BackButton } from "@/components/navigation/back-button";
import { ProfileLinkChips } from "@/components/support/profile-link-chips";
import { HomeComicCard } from "@/components/catalog/home-comic-card";
import { ExpandableText } from "@/components/ui/expandable-text";
import { SafeAvatar } from "@/components/ui/safe-avatar";

interface PageProps {
  params: Promise<{ publisherId: string }>;
}

export default async function PublisherPublicProfilePage({ params }: PageProps) {
  const { publisherId } = await params;

  const publisher = await prisma.publisher.findUnique({
    where: { id: publisherId },
    select: {
      id: true,
      name: true,
      bio: true,
      avatarUrl: true,
      telegramUrl: true,
      instagramUrl: true,
      websiteUrl: true,
      donationLink: true,
      customLinks: true,
      isVerified: true,
      contractUserId: true,
      contractUser: { select: { telegramPhotoUrl: true } },
    },
  });

  if (!publisher) {
    notFound();
  }

  const [user, allowedRatings] = await Promise.all([getSessionUser(), getAllowedAgeRatings()]);

  const [comics, canReceive] = await Promise.all([
    prisma.comic.findMany({
      where: {
        approvalStatus: "APPROVED",
        ageRating: { in: allowedRatings },
        OR: [
          { license: { publisherId: publisher.id } },
          { editions: { some: { publisherId: publisher.id, status: "ACTIVE" } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        title: true,
        slug: true,
        coverImage: true,
        chapters: {
          where: { publishedAt: { not: null } },
          orderBy: { chapterNumber: "desc" },
          take: 1,
          select: { chapterNumber: true },
        },
      },
    }),
    publisher.contractUserId ? isEligibleDonationReceiver(publisher.contractUserId) : Promise.resolve(false),
  ]);

  const isOwner = Boolean(user && publisher.contractUserId && user.id === publisher.contractUserId);
  const avatarSrc = publisher.avatarUrl ?? publisher.contractUser?.telegramPhotoUrl ?? null;

  const links: ProfileLink[] = [
    { label: "تلگرام", url: publisher.telegramUrl },
    { label: "اینستاگرام", url: publisher.instagramUrl },
    { label: "وب‌سایت", url: publisher.websiteUrl },
  ]
    .filter((item): item is ProfileLink => Boolean(item.url))
    .concat(parseCustomLinks(publisher.customLinks));

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <BackButton fallbackHref="/app" variant="plain" />

        <header className="flex items-center gap-3">
          <SafeAvatar src={avatarSrc} fallbackText={publisher.name} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-1.5 text-lg font-semibold text-text-main">
              <span className="truncate">{publisher.name}</span>
              {publisher.isVerified && <BadgeCheck size={16} className="flex-shrink-0 text-primary" />}
            </h1>
            <p className="text-xs text-text-muted">ناشر · {comics.length.toLocaleString("fa-IR")} اثر</p>
          </div>
          {canReceive && !isOwner && publisher.contractUserId && (
            <DonateButton receiverId={publisher.contractUserId} authenticated={Boolean(user)} receiverName={publisher.name} />
          )}
        </header>

        {publisher.bio && <ExpandableText text={publisher.bio} />}

        <ProfileLinkChips links={links} />

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text-main">آثار این ناشر</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {comics.map((comic) => (
              <HomeComicCard
                key={comic.id}
                slug={comic.slug}
                title={comic.title}
                coverImage={comic.coverImage}
                latestChapter={comic.chapters[0]?.chapterNumber ?? null}
              />
            ))}
            {comics.length === 0 && <p className="col-span-full text-sm text-text-muted">هنوز اثری منتشر نشده است.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}