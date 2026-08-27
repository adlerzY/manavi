import { Skeleton } from "@/components/ui/skeleton";

export function AdminStatsGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-md border border-border bg-surface p-4 text-center">
          <Skeleton className="mx-auto h-7 w-12" />
          <Skeleton className="mx-auto mt-2 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function AdminToolbarSkeleton() {
  return (
    <div className="flex flex-wrap gap-2">
      <Skeleton className="h-10 min-w-[160px] flex-1 rounded-md" />
      <Skeleton className="h-10 w-32 rounded-md" />
      <Skeleton className="h-10 w-24 rounded-md" />
    </div>
  );
}

export function AdminTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border rounded-md border border-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-4 py-3">
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function AdminFormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-4 rounded-md border border-border bg-surface p-6">
      <Skeleton className="h-5 w-32" />
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      ))}
      <Skeleton className="h-10 w-28 rounded-md" />
    </div>
  );
}

export function AdminCollapsibleTriggerSkeleton() {
  return <Skeleton className="h-11 w-full rounded-md" />;
}

export function AdminPaginationSkeleton() {
  return (
    <div className="flex items-center justify-between">
      <Skeleton className="h-3 w-20" />
      <div className="flex gap-2">
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-3 w-10" />
      </div>
    </div>
  );
}