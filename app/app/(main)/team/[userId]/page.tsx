import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { DonateButton } from "@/components/team/donate-button";
import { BackButton } from "@/components/navigation/back-button";
import { WalletAndLinks } from "@/components/support/wallet-and-links";
import { SafeAvatar } from "@/components/ui/safe-avatar";
import { SafeCoverImage } from "@/components/ui/safe-cover-image";
import { parseCustomLinks } from "@/lib/profile-links";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";

interface PageProps {
  params: Promise<{ userId: string }>;
}

export default async function TeamProfilePage({ params }: PageProps) {
  const { userId } = await params;

  const [profileUser, sessionUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        bio: true,
        avatarUrl: true,
        telegramPhotoUrl: true,
        donationLink: true,
        cryptoWalletLabel: true,
        cryptoWalletAddress: true,
        customLinks: true,
        staffRoles: {
          select: { roleTitle: true, comic: { select: { id: true, title: true, slug: true, coverImage: true } } },
        },
      },
    }),
    getSessionUser(),
  ]);

  if (!profileUser) {
    notFound();
  }

  const chapterCounts = await prisma.chapterStaff.groupBy({
    by: ["roleTitle"],
    where: { userId: profileUser.id, chapter: { publishedAt: { not: null } } },
    _count: { _all: true },
  });

  const comicsByTitle = new Map<
    string,
    { id: string; title: string; slug: string; coverImage: string; roles: Set<string> }
  >();

  for (const entry of profileUser.staffRoles) {
    const existing = comicsByTitle.get(entry.comic.id);
    if (existing) {
      existing.roles.add(entry.roleTitle);
    } else {
      comicsByTitle.set(entry.comic.id, { ...entry.comic, roles: new Set([entry.roleTitle]) });
    }
  }

  const isOwnProfile = sessionUser?.id === profileUser.id;

  return (
    <>
      <main className="min-h-screen bg-background px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4">
            <BackButton fallbackHref="/app" variant="plain" />
          </div>
          <div className="flex items-center gap-4">
            <SafeAvatar src={profileUser.avatarUrl ?? profileUser.telegramPhotoUrl} fallbackText={profileUser.firstName} size={64} />
            <div>
              <h1 className="text-xl font-semibold text-text-main">
                {profileUser.firstName} {profileUser.lastName ?? ""}
              </h1>
              {profileUser.username && <p className="text-sm text-text-muted">@{profileUser.username}</p>}
            </div>
          </div>

          {profileUser.bio && <p className="mt-4 max-w-xl text-sm text-text-muted">{profileUser.bio}</p>}

          {!isOwnProfile && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <DonateButton receiverId={profileUser.id} authenticated={Boolean(sessionUser)} />
                {profileUser.donationLink && (
                  <a href={profileUser.donationLink} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                    لینک دونیت خارجی
                  </a>
                )}
              </div>
              <WalletAndLinks
                cryptoWalletLabel={profileUser.cryptoWalletLabel}
                cryptoWalletAddress={profileUser.cryptoWalletAddress}
                customLinks={parseCustomLinks(profileUser.customLinks)}
              />
            </div>
          )}

          {isOwnProfile && (
            <Link href="/app/profile" className="mt-4 inline-block text-xs text-primary underline">
              ویرایش پروفایل
            </Link>
          )}

          <div className="mt-6 grid grid-cols-3 gap-3">
            {chapterCounts.map((c) => (
              <div key={c.roleTitle} className="rounded-md border border-border bg-surface p-4 text-center">
                <p className="text-2xl font-semibold text-primary">{c._count._all}</p>
                <p className="mt-1 text-xs text-text-muted">{STAFF_ROLE_LABELS[c.roleTitle as keyof typeof STAFF_ROLE_LABELS] ?? c.roleTitle}</p>
              </div>
            ))}
            {chapterCounts.length === 0 && (
              <p className="col-span-3 text-sm text-text-muted">هنوز چپتری ثبت نشده است.</p>
            )}
          </div>

          <h2 className="mb-3 mt-8 text-sm font-medium text-text-main">پروژه‌ها</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from(comicsByTitle.values()).map((comic) => (
              <Link key={comic.id} href={`/app/comic/${comic.slug}`} className="block">
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-surface">
                  <SafeCoverImage src={comic.coverImage} alt={comic.title} fill sizes="(max-width: 768px) 50vw, 200px" className="object-cover" />
                </div>
                <p className="mt-2 truncate text-sm text-text-main">{comic.title}</p>
                <p className="text-xs text-text-muted">
                  {Array.from(comic.roles)
                    .map((r) => STAFF_ROLE_LABELS[r as keyof typeof STAFF_ROLE_LABELS] ?? r)
                    .join("، ")}
                </p>
              </Link>
            ))}
            {comicsByTitle.size === 0 && (
              <p className="col-span-full text-sm text-text-muted">هنوز پروژه‌ای ثبت نشده است.</p>
            )}
          </div>
        </div>
      </main>
    </>
  );
}