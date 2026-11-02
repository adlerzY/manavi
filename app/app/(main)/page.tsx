import { Suspense } from "react";
import type { AgeRating } from "@prisma/client";
import { maybeTriggerScheduledPublish } from "@/lib/scheduled-publish";
import { getAllowedAgeRatings } from "@/lib/content-filter";
import { getAllGenres } from "@/lib/genres";
import { getHomepageCategories } from "@/lib/categories";
import {
  getHeroComics,
  getLatestComments,
  getCompletedSeries,
  getMostBookmarkedComics,
  getCategoryPreview,
} from "@/lib/home-feed";
import { getFullyFreeComics } from "@/lib/free-feed";
import { getHomeFeedComics } from "@/app/actions/home-feed";
import { UserHeaderSection } from "@/components/home/user-header-async";
import { UserHeaderSkeleton } from "@/components/home/user-header-skeleton";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { FullyFreeSection } from "@/components/home/fully-free-section";
import { NewestPopularSection } from "@/components/home/newest-popular-section";
import { RecommendedSectionAsync } from "@/components/home/recommended-section-async";
import { BecauseYouReadAsync } from "@/components/home/because-you-read-section";
import { MostBookmarkedSection } from "@/components/home/most-bookmarked-section";
import { CompletedSeriesSection } from "@/components/home/completed-series-section";
import { LatestCommentsSection } from "@/components/home/latest-comments-section";
import { CategoryRowSection } from "@/components/home/category-row-section";
import { ComicCardSkeletonGrid } from "@/components/catalog/comic-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

const FULLY_FREE_LIMIT = 12;

function HeroFallback() {
  return (
    <section className="px-4 pb-6 pt-2">
      <Skeleton className="mx-auto aspect-[16/9] w-full max-w-4xl rounded-2xl sm:aspect-[21/9]" />
    </section>
  );
}

function RowFallback() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-6">
      <Skeleton className="mb-3 h-5 w-32" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] w-28 flex-shrink-0 sm:w-32" />
        ))}
      </div>
    </section>
  );
}

function FeedFallback() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-6">
      <ComicCardSkeletonGrid count={6} />
    </section>
  );
}

async function HomeHero({ ratings }: { ratings: AgeRating[] }) {
  const comics = await getHeroComics(ratings);
  return <HeroCarousel comics={comics} />;
}

async function HomeFullyFree({ ratings }: { ratings: AgeRating[] }) {
  const comics = await getFullyFreeComics(ratings, FULLY_FREE_LIMIT);
  return <FullyFreeSection comics={comics} />;
}

async function HomeFeed() {
  const [genres, newest, popular] = await Promise.all([
    getAllGenres(),
    getHomeFeedComics("newest"),
    getHomeFeedComics("popular"),
  ]);
  return (
    <NewestPopularSection
      initialNewest={newest}
      initialPopular={popular}
      genres={genres.map((g) => ({ id: g.id, name: g.name }))}
    />
  );
}

async function HomeCategoryRows({ ratings }: { ratings: AgeRating[] }) {
  const categories = await getHomepageCategories();
  const previews = await Promise.all(categories.map((category) => getCategoryPreview(category.id, ratings)));
  return (
    <>
      {categories.map((category, i) => (
        <CategoryRowSection key={category.id} category={category} comics={previews[i]} />
      ))}
    </>
  );
}

async function HomeMostBookmarked({ ratings }: { ratings: AgeRating[] }) {
  const comics = await getMostBookmarkedComics(ratings);
  return <MostBookmarkedSection comics={comics} />;
}

async function HomeCompleted({ ratings }: { ratings: AgeRating[] }) {
  const comics = await getCompletedSeries(ratings);
  return <CompletedSeriesSection comics={comics} />;
}

async function HomeLatestComments({ ratings }: { ratings: AgeRating[] }) {
  const comments = await getLatestComments(ratings);
  return <LatestCommentsSection comments={comments} />;
}

export default async function AppHomePage() {
  maybeTriggerScheduledPublish();

  const allowedRatings = await getAllowedAgeRatings();

  return (
    <main className="min-h-screen bg-background">
      <Suspense fallback={<UserHeaderSkeleton />}>
        <UserHeaderSection />
      </Suspense>

      <Suspense fallback={<HeroFallback />}>
        <HomeHero ratings={allowedRatings} />
      </Suspense>

      <Suspense fallback={null}>
        <HomeFullyFree ratings={allowedRatings} />
      </Suspense>

      <Suspense fallback={<FeedFallback />}>
        <HomeFeed />
      </Suspense>

      <Suspense fallback={null}>
        <RecommendedSectionAsync allowedRatings={allowedRatings} />
      </Suspense>

      <Suspense fallback={null}>
        <BecauseYouReadAsync allowedRatings={allowedRatings} />
      </Suspense>

      <Suspense fallback={<RowFallback />}>
        <HomeCategoryRows ratings={allowedRatings} />
      </Suspense>

      <Suspense fallback={<RowFallback />}>
        <HomeMostBookmarked ratings={allowedRatings} />
      </Suspense>

      <Suspense fallback={<RowFallback />}>
        <HomeCompleted ratings={allowedRatings} />
      </Suspense>

      <Suspense fallback={<RowFallback />}>
        <HomeLatestComments ratings={allowedRatings} />
      </Suspense>
    </main>
  );
}