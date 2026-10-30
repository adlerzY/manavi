import { ComicCardSkeletonGrid } from "@/components/catalog/comic-card-skeleton";
import { UserHeaderSkeleton } from "@/components/home/user-header-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="min-h-screen bg-background">
      <UserHeaderSkeleton />

      <section className="px-4 pb-6 pt-2">
        <Skeleton className="mx-auto aspect-[16/9] w-full max-w-4xl rounded-2xl sm:aspect-[21/9]" />
      </section>

      <section className="mx-auto max-w-4xl px-4 py-3">
        <Skeleton className="h-56 w-full rounded-3xl" />
      </section>

      <section className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-3 flex gap-2">
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
        <div className="mb-4 flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-16 flex-shrink-0 rounded-full" />
          ))}
        </div>
        <ComicCardSkeletonGrid count={9} />
      </section>

      <section className="mx-auto max-w-4xl px-4 py-6">
        <Skeleton className="mb-3 h-5 w-40" />
        <ComicCardSkeletonGrid count={9} />
      </section>

      <section className="mx-auto max-w-4xl px-4 py-6">
        <Skeleton className="mb-3 h-5 w-32" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-52 flex-shrink-0 rounded-md" />
          ))}
        </div>
      </section>
    </main>
  );
}