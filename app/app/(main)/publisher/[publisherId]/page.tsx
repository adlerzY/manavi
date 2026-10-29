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
      cryptoWalletLabel: true,
      cryptoWalletAddress: true,
      customLinks: true,
      contractUserId: true,
      contractUser: { select: { telegramPhotoUrl: true } },
      licenses: {
        select: {
          comics: {
            select: {
              id: true,
              title: true,
              slug: true,
              coverImage: true,
              chapters: { where: { publishedAt: { not: null } }, orderBy: { chapterNumber: "desc" }, take: 1, select: { chapterNumber: true } },
            },
          },
        },
      },
    },
  });

  if (!publisher) {
    notFound();
  }

  const user = await getSessionUser();
  const comics = publisher.licenses.flatMap((l) => l.comics);
  const avatarSrc = publisher.avatarUrl ?? publisher.contractUser?.telegramPhotoUrl ?? null;

  return (
    <>
      <main className="min-h-screen bg-background px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4">
            <BackButton fallbackHref="/app" variant="plain" />
          </div>
          <div className="flex items-center gap-4">
            <SafeAvatar src={avatarSrc} fallbackText={publisher.name} size={64} />
            <div>
              <h1 className="text-xl font-semibold text-text-main">{publisher.name}</h1>
              <p className="text-xs text-text-muted">ناشر</p>
            </div>
          </div>

          {publisher.bio && <p className="mt-4 max-w-xl text-sm text-text-muted">{publisher.bio}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            {publisher.telegramUrl && (
              <a href={publisher.telegramUrl} target="_blank" rel="noreferrer" className="rounded-md border border-border px-3 py-1.5 text-xs text-text-main hover:border-primary">
                تلگرام
              </a>
            )}
            {publisher.instagramUrl && (
              <a href={publisher.instagramUrl} target="_blank" rel="noreferrer" className="rounded-md border border-border px-3 py-1.5 text-xs text-text-main hover:border-primary">
                اینستاگرام
              </a>
            )}
            {publisher.websiteUrl && (
              <a href={publisher.websiteUrl} target="_blank" rel="noreferrer" className="rounded-md border border-border px-3 py-1.5 text-xs text-text-main hover:border-primary">
                وب‌سایت
              </a>
            )}
          </div>

          <div className="mt-6 rounded-md border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium text-text-main">حمایت مالی</h2>
            <div className="flex flex-wrap items-center gap-3">
              {publisher.contractUserId && (
                <DonateButton receiverId={publisher.contractUserId} authenticated={Boolean(user)} />
              )}
              {publisher.donationLink && (
                <a href={publisher.donationLink} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                  لینک دونیت خارجی
                </a>
              )}
              {!publisher.contractUserId && !publisher.donationLink && (
                <p className="text-xs text-text-muted">راه حمایت مالی هنوز ثبت نشده است.</p>
              )}
            </div>
            <WalletAndLinks
              cryptoWalletLabel={publisher.cryptoWalletLabel}
              cryptoWalletAddress={publisher.cryptoWalletAddress}
              customLinks={parseCustomLinks(publisher.customLinks)}
            />
          </div>

          <h2 className="mb-3 mt-8 text-sm font-medium text-text-main">آثار این ناشر</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {comics.map((comic) => (
              <Link key={comic.id} href={`/app/comic/${comic.slug}`} className="block">
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-surface">
                  <SafeCoverImage src={comic.coverImage} alt={comic.title} fill sizes="(max-width: 768px) 50vw, 200px" className="object-cover" />
                </div>
                <p className="mt-2 truncate text-sm text-text-main">{comic.title}</p>
                {comic.chapters[0] && <p className="text-xs text-text-muted">چپتر {comic.chapters[0].chapterNumber.toLocaleString("fa-IR")}</p>}
              </Link>
            ))}
            {comics.length === 0 && <p className="col-span-full text-sm text-text-muted">هنوز عنوانی ثبت نشده است.</p>}
          </div>
        </div>
      </main>
    </>
  );
}