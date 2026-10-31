import { notFound } from "next/navigation";
import { after } from "next/server";
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
import { ComicCredits } from "@/components/catalog/comic-credits";
import { ComicMoreSheet } from "@/components/catalog/comic-more-sheet";
import { EditionSelector } from "@/components/catalog/edition-selector";
import { RatingPanel } from "@/components/catalog/rating-panel";
import { ReportButton } from "@/components/catalog/report-button";
import { RequestEditionCard } from "@/components/catalog/request-edition-card";
import { BackButton } from "@/components/navigation/back-button";
import { ComicUnlockButton } from "@/components/reader/comic-unlock-button";
import { ExpandableText } from "@/components/ui/expandable-text";
import { SafeCoverImage } from "@/components/ui/safe-cover-image";
import { getChapterAccessList, getEditionUnlockPreview } from "@/lib/chapters";
import { getChapterUnlockCoinCost } from "@/lib/platform-settings";
import { getWorkEditions, pickEdition, getUserRatingContext, getUserEditionRequest } from "@/lib/editions";
import { averageScore, requiredReadChapters } from "@/lib/rating";
import { getAllowedAgeRatings } from "@/lib/content-filter";
import { COMIC_STATUS_LABELS } from "@/lib/labels";
import { getSimilarComics, recordComicView } from "@/lib/recommendations";

export const revalidate = 300;

type TabId = "preview" | "episodes" | "similar";

const VALID_TABS: TabId[] = ["preview", "episodes", "similar"];
const MAX_VISIBLE_GENRES = 5;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ edition?: string; lang?: string; tab?: string }>;
}

export default async function ComicDetailPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { edition: editionParam, lang: langParam, tab: tabParam } = await searchParams;

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
      categoryId: true,
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

  const [user, editions] = await Promise.all([getSessionUser(), getWorkEditions(comic.id)]);

  const isPrivileged = user?.role === "ADMIN" || user?.id === comic.createdById;
  let isTeamMember = false;
  if (!isPrivileged && user) {
    const ownContext = await getPublisherContext(user);
    isTeamMember = Boolean(ownContext && editions.some((edition) => edition.publisherId === ownContext.publisherId));
  }

  if (comic.approvalStatus !== "APPROVED" && !isPrivileged && !isTeamMember) {
    notFound();
  }

  if (user) {
    after(() => recordComicView(user.id, comic.id).catch(() => {}));
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
    getSimilarComics({
      comicId: comic.id,
      categoryId: comic.categoryId,
      genreIds: comic.genres.map((g) => g.genreId),
      allowedRatings,
      limit: 12,
    }),
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
    user && selected && licenseActive && coinChapterIds.length > 0 && user.role !== "ADMIN"
      ? prisma.entitlement
          .findMany({
            where: {
              userId: user.id,
              chapter: { editionId: selected.id },
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

  const requestedTab = VALID_TABS.find((value) => value === tabParam);
  const defaultTab: TabId = requestedTab ?? (hasRead ? "episodes" : "preview");

  const editionOptions = editions.map((edition) => ({ ...edition, price: edition.priceCoinsOverride ?? defaultPrice }));
  const alternativeCount = Math.max(0, editions.length - 1);
  const visibleStaff = comic.staff.filter((s) => !s.editionId || s.editionId === selected?.id);
  const creditsStaff = visibleStaff.map((s) => ({
    userId: s.user.id,
    name: s.user.username ? `@${s.user.username}` : s.user.firstName,
    role: s.roleTitle,
  }));
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
        isCurrent: resumeChapter?.id === chapter.id,
      }))
    : [];

  const content = (
    <>
      <div
        className="relative h-32 w-full overflow-hidden bg-surface sm:h-48"
        style={!comic.bannerImage ? { backgroundColor: comic.dominantColor ?? "#1E1E1E" } : undefined}
      >
        {comic.bannerImage && (
          <SafeCoverImage src={comic.bannerImage} alt="" fill priority sizes="100vw" className="object-cover opacity-60" />
        )}
        <div
          className="absolute inset-x-0 bottom-0 h-20"
          style={{ backgroundImage: "linear-gradient(to top, #121212, transparent)" }}
        />
        <div className="absolute right-4 top-4 z-10">
          <BackButton fallbackHref="/app" />
        </div>
      </div>

      <div className="mx-auto -mt-12 max-w-4xl px-4 pb-3">
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

        <div className="flex items-end gap-3">
          <div className="relative h-40 w-28 flex-shrink-0 overflow-hidden rounded-md bg-surface shadow-lg">
            <SafeCoverImage src={comic.coverImage} alt={comic.title} fill priority sizes="112px" className="object-cover" />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="text-xl font-semibold leading-snug text-text-main">{comic.title}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-muted">
              <span className="rounded-full bg-surface px-2.5 py-1 text-primary">{comic.category.name}</span>
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
          </div>
        </div>

        {comic.genres.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {comic.genres.slice(0, MAX_VISIBLE_GENRES).map(({ genre }) => (
              <GenrePill key={genre.id} id={genre.id} name={genre.name} />
            ))}
          </div>
        )}

        <ComicCredits
          publisher={
            selected
              ? { id: selected.publisherId, name: selected.publisherName, avatarUrl: selected.publisherAvatarUrl }
              : null
          }
          staff={creditsStaff}
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <BookmarkButton comicId={comic.id} comicSlug={comic.slug} authenticated={Boolean(user)} initialBookmarked={bookmarked} />
          <ComicMoreSheet
            label={alternativeCount > 0 ? `${alternativeCount.toLocaleString("fa-IR")} ترجمه‌ی دیگر` : "بیشتر"}
            highlight={alternativeCount > 0}
            editions={
              alternativeCount > 0 && selected ? (
                <EditionSelector slug={comic.slug} editions={editionOptions} selectedId={selected.id} />
              ) : null
            }
            rating={
              selected ? (
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
              ) : null
            }
            request={
              <RequestEditionCard workId={comic.id} authenticated={Boolean(user)} activeLanguage={editionRequest?.language ?? null} />
            }
            report={
              user ? (
                <div className="flex flex-wrap items-center gap-4">
                  {selected && <ReportButton targetType="EDITION" targetId={selected.id} label="گزارش مشکل این نسخه" />}
                  <ReportButton targetType="WORK" targetId={comic.id} label="گزارش مشکل این اثر" />
                </div>
              ) : null
            }
          />
        </div>

        {selected && licenseActive && unlockPreview.lockedCount > 0 && (
          <div className="mt-3">
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
          defaultTab={defaultTab}
          preview={
            <div className="space-y-5">
              <ExpandableText text={comic.description} />

              {licenseActive && firstChapter && firstChapterPages.length > 0 && (
                <div>
                  <h2 className="mb-2 text-sm font-medium text-text-main">پیش‌نمایش چپتر اول</h2>
                  <ChapterOnePreview chapterId={firstChapter.id} chapterNumber={firstChapter.chapterNumber} previewImages={firstChapterPages} />
                </div>
              )}
            </div>
          }
          episodes={
            <ChapterList
              chapters={chapterListItems}
              price={chapterPrice}
              focusCurrent={Boolean(resumeChapter) && defaultTab === "episodes"}
            />
          }
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
                    latestChapter={c.latestChapter}
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