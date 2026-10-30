import { Skeleton } from "@/components/ui/skeleton";

export function UserHeaderSkeleton() {
  return (
    <header className="px-4 pb-3 pt-4">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-2xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-10 w-20 rounded-full" />
        </div>
      </div>
    </header>
  );
}