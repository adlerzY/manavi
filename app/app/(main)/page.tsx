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
import { getHomeFeedComics } from "@/app/actions/home-feed";
import { UserHeaderSection } from "@/components/home/user-header-async";
import { UserHeaderSkeleton } from "@/components/home/user-header-skeleton";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { NewestPopularSection } from "@/components/home/newest-popular-section";
import { RecommendedSectionAsync } from "@/components/home/recommended-section-async";
import { MostBookmarkedSection } from "@/components/home/most-bookmarked-section";
import { CompletedSeriesSection } from "@/components/home/completed-series-section";
import { LatestCommentsSection } from "@/components/home/latest-comments-section";
import { CategoryRowSection } from "@/components/home/category-row-section";

export const revalidate = 300;

export default async function AppHomePage() {
  maybeTriggerScheduledPublish();

  const allowedRatings = await getAllowedAgeRatings();

  const homepageCategoriesPromise = getHomepageCategories();
  const categoryPreviewsPromise: Promise<HomeFeedComic[][]> = homepageCategoriesPromise.then((categories) =>
    Promise.all(categories.map((category) => getCategoryPreview(category.id, allowedRatings)))
  );

  const [
    heroComics,
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
    getAllGenres(),
    homepageCategoriesPromise,
    getHomeFeedComics("newest"),
    getHomeFeedComics("popular"),
    getMostBookmarkedComics(allowedRatings),
    getCompletedSeries(allowedRatings),
    getLatestComments(allowedRatings),
    categoryPreviewsPromise,
  ]);

  const shuffledHeroComics = heroComics.length > 1 ? [...heroComics].sort(() => Math.random() - 0.5) : heroComics;

  return (
    <main className="min-h-screen bg-background">
      <Suspense fallback={<UserHeaderSkeleton />}>
        <UserHeaderSection />
      </Suspense>

      <HeroCarousel comics={shuffledHeroComics} />

      <NewestPopularSection initialNewest={newest} initialPopular={popular} genres={genres.map((g) => ({ id: g.id, name: g.name }))} />

      <Suspense fallback={null}>
        <RecommendedSectionAsync allowedRatings={allowedRatings} />
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