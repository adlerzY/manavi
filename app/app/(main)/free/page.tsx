import Link from "next/link";
import { redirect } from "next/navigation";
import { getAllowedAgeRatings } from "@/lib/content-filter";
import { getFullyFreePage } from "@/lib/free-feed";
import { HomeComicCard } from "@/components/catalog/home-comic-card";
import { BackButton } from "@/components/navigation/back-button";
import { EmptyState } from "@/components/ui/empty-state";

export const revalidate = 120;

const PAGE_SIZE = 30;

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function FreeComicsPage({ searchParams }: PageProps) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Math.floor(Number(pageParam) || 1));

  const allowedRatings = await getAllowedAgeRatings();
  const { comics, total } = await getFullyFreePage(allowedRatings, page, PAGE_SIZE);

  if (comics.length === 0 && total > 0) redirect("/app/free");

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hrefFor = (nextPage: number) => (nextPage > 1 ? `/app/free?page=${nextPage}` : "/app/free");

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex items-center gap-3">
          <BackButton fallbackHref="/app" variant="plain" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-text-main">تمام رایگان</h1>
            <p className="mt-0.5 text-xs text-text-muted">
              {total.toLocaleString("fa-IR")} اثر که همه‌ی چپترهاشون رایگانه
            </p>
          </div>
        </div>

        {comics.length === 0 ? (
          <EmptyState
            pose="thinking"
            title="هنوز اثر تمام رایگانی نداریم"
            description="به‌محض اینکه اثری کاملاً رایگان بشه، همین‌جا میاد. فعلاً می‌تونی بقیه‌ی آثار رو ببینی."
            actions={[{ href: "/app/explore", label: "رفتن به جستجو" }]}
          />
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {comics.map((comic, index) => (
              <HomeComicCard
                key={comic.id}
                slug={comic.slug}
                title={comic.title}
                coverImage={comic.coverImage}
                latestChapter={comic.latestChapter}
                completed={comic.completed}
                priority={index < 6}
                isFree
              />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-text-muted">
            <Link
              href={hrefFor(page - 1)}
              className={`rounded-md border border-border px-3 py-2 ${
                page <= 1 ? "pointer-events-none opacity-30" : "hover:border-primary"
              }`}
            >
              قبلی
            </Link>
            <span>
              صفحه {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}
            </span>
            <Link
              href={hrefFor(page + 1)}
              className={`rounded-md border border-border px-3 py-2 ${
                page >= totalPages ? "pointer-events-none opacity-30" : "hover:border-primary"
              }`}
            >
              بعدی
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}