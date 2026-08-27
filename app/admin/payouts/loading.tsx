import { AdminTableSkeleton } from "@/components/admin/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-6 w-40" />
      <div className="flex flex-wrap items-end gap-2">
        <Skeleton className="h-10 w-32 rounded-md" />
        <Skeleton className="h-10 w-32 rounded-md" />
        <Skeleton className="h-10 w-24 rounded-md" />
      </div>
      <AdminTableSkeleton rows={5} />
      <div>
        <Skeleton className="mb-3 h-5 w-40" />
        <AdminTableSkeleton rows={6} />
      </div>
    </div>
  );
}