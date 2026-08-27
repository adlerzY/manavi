import { AdminStatsGridSkeleton, AdminTableSkeleton } from "@/components/admin/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-8">
      <AdminStatsGridSkeleton count={4} />
      <div>
        <Skeleton className="mb-3 h-5 w-40" />
        <AdminTableSkeleton rows={10} />
      </div>
      <div>
        <Skeleton className="mb-3 h-5 w-40" />
        <AdminTableSkeleton rows={10} />
      </div>
    </div>
  );
}