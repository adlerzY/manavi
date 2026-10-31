import { Suspense } from "react";
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
import type { HomeFeedComic } from "@/lib/home-feed";
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

export const revalidate = 300;

const FULLY_FREE_LIMIT = 12;

export default async function AppHomePage() {
  maybeTriggerScheduledPublish();

  const allowedRatings = await getAllowedAgeRatings();

  const homepageCategoriesPromise = getHomepageCategories();
  const categoryPreviewsPromise: Promise<HomeFeedComic[][]> = homepageCategoriesPromise.then((categories) =>
    Promise.all(categories.map((category) => getCategoryPreview(category.id, allowedRatings)))
  );

  const [
    heroComics,
    fullyFree,
    genres,
    homepageCategories,
    newest,
    popular,
    mostBookmarked,
    completedSeries,
    latestComments,
    categoryPreviews,
  ] = await Promise.all([
    getHeroComics(allowedRatings),
    getFullyFreeComics(allowedRatings, FULLY_FREE_LIMIT),
    getAllGenres(),
    homepageCategoriesPromise,
    getHomeFeedComics("newest"),
    getHomeFeedComics("popular"),
    getMostBookmarkedComics(allowedRatings),
    getCompletedSeries(allowedRatings),
    getLatestComments(allowedRatings),
    categoryPreviewsPromise,
  ]);

  return (
    <main className="min-h-screen bg-background">
      <Suspense fallback={<UserHeaderSkeleton />}>
        <UserHeaderSection />
      </Suspense>

      <HeroCarousel comics={heroComics} />

      <FullyFreeSection comics={fullyFree} />

      <NewestPopularSection initialNewest={newest} initialPopular={popular} genres={genres.map((g) => ({ id: g.id, name: g.name }))} />

      <Suspense fallback={null}>
        <RecommendedSectionAsync allowedRatings={allowedRatings} />
      </Suspense>

      <Suspense fallback={null}>
        <BecauseYouReadAsync allowedRatings={allowedRatings} />
      </Suspense>

      {homepageCategories.map((category, i) => (
        <CategoryRowSection key={category.id} category={category} comics={categoryPreviews[i]} />
      ))}

      <MostBookmarkedSection comics={mostBookmarked} />

      <CompletedSeriesSection comics={completedSeries} />

      <LatestCommentsSection comments={latestComments} />
    </main>
  );
}