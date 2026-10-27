import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser, getPublisherContext } from "@/lib/auth";
import { getSignedImageUrls } from "@/lib/s3";
import { getReadChapterIds, hasReadAnyChapter } from "@/lib/read-marks";
import { AgeGate } from "@/components/catalog/age-gate";
import { BookmarkButton } from "@/components/catalog/bookmark-button";
import { ComicCard } from "@/components/catalog/comic-card";
import { GenrePill } from "@/components/catalog/genre-pill";
import { ComicDetailTabs } from "@/components/catalog/comic-detail-tabs";
import { ChapterOnePreview } from "@/components/catalog/chapter-one-preview";
import { ChapterList, type ChapterListItem } from "@/components/catalog/chapter-list";
import { EditionSelector } from "@/components/catalog/edition-selector";
import { RatingPanel } from "@/components/catalog/rating-panel";
import { ReportButton } from "@/components/catalog/report-button";
import { RequestEditionCard } from "@/components/catalog/request-edition-card";
import { BackButton } from "@/components/navigation/back-button";
import { ComicUnlockButton } from "@/components/reader/comic-unlock-button";
import { SafeAvatar } from "@/components/ui/safe-avatar";
import { SafeCoverImage } from "@/components/ui/safe-cover-image";
import { getChapterAccessList, getEditionUnlockPreview } from "@/lib/chapters";
import { getChapterUnlockCoinCost } from "@/lib/platform-settings";
import { getWorkEditions, pickEdition, getUserRatingContext, getUserEditionRequest } from "@/lib/editions";
import { averageScore, requiredReadChapters } from "@/lib/rating";
import { getAllowedAgeRatings } from "@/lib/content-filter";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";
import { COMIC_STATUS_LABELS } from "@/lib/labels";

export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ edition?: string; lang?: string }>;
}

export default async function ComicDetailPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { edition: editionParam, lang: langParam } = await searchParams;

  const comic = await prisma.comic.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      coverImage: true,
      bannerImage: true,
      dominantColor: true,
      ageRating: true,
      status: true,
      approvalStatus: true,
      createdById: true,
      rejectionNote: true,
      ratingCount: true,
      ratingTotal: true,
      category: { select: { name: true } },
      genres: { include: { genre: true } },
      staff: {
        select: {
          id: true,
          roleTitle: true,
          editionId: true,
          user: { select: { id: true, firstName: true, username: true } },
        },
      },
    },
  });

  if (!comic) {
    notFound();
  }

  const user = await getSessionUser();
  const editions = await getWorkEditions(comic.id);

  const isPrivileged = user?.role === "ADMIN" || user?.id === comic.createdById;
  let isTeamMember = false;
  if (!isPrivileged && user) {
    const ownContext = await getPublisherContext(user);
    isTeamMember = Boolean(ownContext && editions.some((edition) => edition.publisherId === ownContext.publisherId));
  }

  if (comic.approvalStatus !== "APPROVED" && !isPrivileged && !isTeamMember) {
    notFound();
  }

  const selected = pickEdition(editions, editionParam, langParam);
  const licenseActive = Boolean(selected && selected.status === "ACTIVE" && selected.licenseStatus === "ACTIVE");

  const [allowedRatings, defaultPrice] = await Promise.all([getAllowedAgeRatings(), getChapterUnlockCoinCost()]);
  const chapterAccess = selected ? await getChapterAccessList(comic.id, selected.id) : [];

  const sortedChapters = [...chapterAccess].sort((a, b) => a.chapterNumber - b.chapterNumber);
  const newestFirstChapters = [...sortedChapters].reverse();
  const firstChapter = sortedChapters[0];
  const coinChapterIds = chapterAccess.filter((chapter) => chapter.locked).map((chapter) => chapter.id);

  const canPreviewAdultContent = comic.ageRating === "NORMAL" || Boolean(user?.isAgeVerified);

  const emptyRatingContext = { workScore: null, editionScore: null, canRateWork: false, canRateEdition: false };

  const [
    bookmarked,
    similarComics,
    firstChapterPages,
    readHistoryEntry,
    readChapterIds,
    hasRead,
    unlockPreview,
    ratingContext,
    editionRequest,
    ownedChapterIds,
  ] = await Promise.all([
    user
      ? prisma.bookmark.findUnique({ where: { userId_comicId: { userId: user.id, comicId: comic.id } } }).then(Boolean)
      : Promise.resolve(false),
    comic.genres.length > 0
      ? prisma.comic.findMany({
          where: {
            id: { not: comic.id },
            ageRating: { in: allowedRatings },
            approvalStatus: "APPROVED",
            genres: { some: { genreId: { in: comic.genres.map((g) => g.genreId) } } },
          },
          orderBy: { viewCount: "desc" },
          take: 12,
          select: {
            id: true,
            title: true,
            slug: true,
            coverImage: true,
            dominantColor: true,
            ratingCount: true,
            ratingTotal: true,
            chapters: { where: { publishedAt: { not: null } }, orderBy: { chapterNumber: "desc" }, take: 1, select: { chapterNumber: true } },
          },
        })
      : Promise.resolve([]),
    firstChapter && licenseActive && canPreviewAdultContent
      ? prisma.chapter
          .findUnique({ where: { id: firstChapter.id }, select: { pages: true } })
          .then((c) => (c ? getSignedImageUrls(c.pages.slice(0, 3), undefined, { width: 640 }) : []))
      : Promise.resolve([]),
    user
      ? prisma.readHistory.findUnique({ where: { userId_comicId: { userId: user.id, comicId: comic.id } } })
      : Promise.resolve(null),
    user ? getReadChapterIds(user.id, comic.id) : Promise.resolve(new Set<string>()),
    user ? hasReadAnyChapter(user.id, comic.id) : Promise.resolve(false),
    selected && licenseActive
      ? getEditionUnlockPreview(user?.id ?? null, selected.id)
      : Promise.resolve({ lockedCount: 0, totalCost: 0, coinCost: defaultPrice }),
    selected
      ? getUserRatingContext(user?.id ?? null, comic.id, selected.id, selected.chapterCount)
      : Promise.resolve(emptyRatingContext),
    user ? getUserEditionRequest(user.id, comic.id) : Promise.resolve(null),
    user && licenseActive && coinChapterIds.length > 0 && user.role !== "ADMIN"
      ? prisma.entitlement
          .findMany({
            where: {
              userId: user.id,
              chapterId: { in: coinChapterIds },
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            select: { chapterId: true },
          })
          .then((rows) => new Set(rows.map((row) => row.chapterId)))
      : Promise.resolve(new Set<string>()),
  ]);

  const resumeChapter = readHistoryEntry ? sortedChapters.find((c) => c.id === readHistoryEntry.lastChapterId) ?? null : null;

  const readingCta =
    licenseActive && firstChapter
      ? resumeChapter
        ? { chapterId: resumeChapter.id, label: `ادامه خواندن — چپتر ${resumeChapter.chapterNumber.toLocaleString("fa-IR")}` }
        : { chapterId: firstChapter.id, label: "شروع خواندن" }
      : null;

  const editionOptions = editions.map((edition) => ({ ...edition, price: edition.priceCoinsOverride ?? defaultPrice }));
  const visibleStaff = comic.staff.filter((s) => !s.editionId || s.editionId === selected?.id);
  const chapterPrice = selected?.priceCoinsOverride ?? defaultPrice;
  const isAdmin = user?.role === "ADMIN";

  const chapterListItems: ChapterListItem[] = licenseActive
    ? newestFirstChapters.map((chapter, index) => ({
        id: chapter.id,
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        publishedAt: chapter.publishedAt,
        isCoin: chapter.locked,
        owned: isAdmin || ownedChapterIds.has(chapter.id),
        isRead: readChapterIds.has(chapter.id),
        isLatest: index === 0,
      }))
    : [];

  const content = (
    <>
      <div
        className="relative h-40 w-full overflow-hidden bg-surface sm:h-56"
        style={!comic.bannerImage ? { backgroundColor: comic.dominantColor ?? "#1E1E1E" } : undefined}
      >
        {comic.bannerImage && (
          <SafeCoverImage src={comic.bannerImage} alt="" fill priority sizes="100vw" className="object-cover opacity-60" />
        )}
        <div
          className="absolute inset-x-0 bottom-0 h-24"
          style={{ backgroundImage: "linear-gradient(to top, #121212, transparent)" }}
        />
        <div className="absolute right-4 top-4 z-10">
          <BackButton fallbackHref="/app" />
        </div>
      </div>

      <div className="mx-auto -mt-16 max-w-4xl px-4 pb-4">
        {(isPrivileged || isTeamMember) && comic.approvalStatus !== "APPROVED" && (
          <div
            className={`mb-4 rounded-md border px-4 py-3 text-sm ${
              comic.approvalStatus === "NEEDS_CHANGES"
                ? "border-red-400 bg-red-500/10 text-red-400"
                : "border-accent bg-accent/10 text-accent"
            }`}
          >
            {comic.approvalStatus === "NEEDS_CHANGES"
              ? `این عنوان نیاز به اصلاح دارد و برای بازدیدکنندگان عادی نمایش داده نمی‌شود. یادداشت ادمین: ${comic.rejectionNote ?? "—"}`
              : "این عنوان در انتظار تایید ادمین است و فعلاً فقط برای شما و تیم شما قابل مشاهده است."}
          </div>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="relative h-56 w-40 flex-shrink-0 overflow-hidden rounded-md bg-surface shadow-lg">
            <SafeCoverImage src={comic.coverImage} alt={comic.title} fill priority sizes="160px" className="object-cover" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-text-main">{comic.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-muted">
              <span className="rounded-full bg-surface px-2.5 py-1 text-xs text-primary">
                {comic.category.name}
              </span>
              <span>{COMIC_STATUS_LABELS[comic.status]}</span>
              <span>·</span>
              <span>{sortedChapters.length.toLocaleString("fa-IR")} چپتر</span>
              {comic.ratingCount > 0 && (
                <>
                  <span>·</span>
                  <span>★ {averageScore(comic.ratingTotal, comic.ratingCount).toLocaleString("fa-IR", { maximumFractionDigits: 1 })}</span>
                </>
              )}
            </p>

            {selected && (
              <Link
                href={`/app/publisher/${selected.publisherId}`}
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-surface py-1.5 pl-3 pr-1.5 text-xs text-text-muted hover:text-primary"
              >
                <SafeAvatar src={selected.publisherAvatarUrl} fallbackText={selected.publisherName} size={24} />
                {selected.publisherName}
              </Link>
            )}

            {comic.genres.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {comic.genres.map(({ genre }) => (
                  <GenrePill key={genre.id} id={genre.id} name={genre.name} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <BookmarkButton comicId={comic.id} comicSlug={comic.slug} authenticated={Boolean(user)} initialBookmarked={bookmarked} />
        </div>

        {selected && (
          <div className="mt-4">
            <EditionSelector slug={comic.slug} editions={editionOptions} selectedId={selected.id} />
          </div>
        )}

        {selected && licenseActive && unlockPreview.lockedCount > 0 && (
          <div className="mt-4">
            <ComicUnlockButton
              editionId={selected.id}
              lockedCount={unlockPreview.lockedCount}
              totalCost={unlockPreview.totalCost}
              authenticated={Boolean(user)}
              coinsBalance={user?.coinsBalance ?? 0}
            />
          </div>
        )}

        {!licenseActive && (
          <p className="mt-4 rounded-md border border-border bg-surface px-4 py-3 text-sm text-text-muted">
            این عنوان موقتاً در دسترس نیست.
          </p>
        )}
      </div>

      <div className="mx-auto max-w-4xl px-4 pb-16">
        <ComicDetailTabs
          episodeCount={sortedChapters.length}
          readingCta={readingCta}
          defaultTab={hasRead ? "episodes" : "preview"}
          preview={
            <div className="space-y-6">
              <p className="text-sm leading-7 text-text-muted">{comic.description}</p>

              {selected && (
                <RatingPanel
                  workId={comic.id}
                  editionId={selected.id}
                  authenticated={Boolean(user)}
                  work={{
                    average: averageScore(comic.ratingTotal, comic.ratingCount),
                    count: comic.ratingCount,
                    mine: ratingContext.workScore,
                  }}
                  edition={{
                    average: averageScore(selected.ratingTotal, selected.ratingCount),
                    count: selected.ratingCount,
                    mine: ratingContext.editionScore,
                  }}
                  canRateWork={ratingContext.canRateWork}
                  canRateEdition={ratingContext.canRateEdition}
                  requiredEditionReads={requiredReadChapters(selected.chapterCount)}
                />
              )}

              {visibleStaff.length > 0 && (
                <div>
                  <h2 className="mb-2 text-sm font-medium text-text-main">دست‌اندرکاران</h2>
                  <div className="flex flex-wrap gap-2">
                    {visibleStaff.map((s) => (
                      <Link
                        key={s.id}
                        href={`/app/team/${s.user.id}`}
                        className="rounded-md border border-border px-3 py-2 text-xs text-text-main hover:border-primary"
                      >
                        {s.user.username ? `@${s.user.username}` : s.user.firstName}
                        <span className="mr-1 text-text-muted">— {STAFF_ROLE_LABELS[s.roleTitle] ?? s.roleTitle}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {licenseActive && firstChapter && firstChapterPages.length > 0 && (
                <div>
                  <h2 className="mb-2 text-sm font-medium text-text-main">پیش‌نمایش چپتر اول</h2>
                  <ChapterOnePreview chapterId={firstChapter.id} chapterNumber={firstChapter.chapterNumber} previewImages={firstChapterPages} />
                </div>
              )}

              <RequestEditionCard workId={comic.id} authenticated={Boolean(user)} activeLanguage={editionRequest?.language ?? null} />

              {user && (
                <div className="flex flex-wrap items-center gap-4">
                  {selected && <ReportButton targetType="EDITION" targetId={selected.id} label="گزارش مشکل این نسخه" />}
                  <ReportButton targetType="WORK" targetId={comic.id} label="گزارش مشکل این اثر" />
                </div>
              )}
            </div>
          }
          episodes={<ChapterList chapters={chapterListItems} price={chapterPrice} />}
          similar={
            similarComics.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {similarComics.map((c) => (
                  <ComicCard
                    key={c.id}
                    slug={c.slug}
                    title={c.title}
                    coverImage={c.coverImage}
                    dominantColor={c.dominantColor}
                    latestChapter={c.chapters[0]?.chapterNumber ?? null}
                    rating={c.ratingCount > 0 ? averageScore(c.ratingTotal, c.ratingCount) : null}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted">موردی برای نمایش یافت نشد.</p>
            )
          }
        />
      </div>
    </>
  );

  return (
    <main className="min-h-screen bg-background">
      {comic.ageRating === "NORMAL" ? content : <AgeGate>{content}</AgeGate>}
    </main>
  );
}