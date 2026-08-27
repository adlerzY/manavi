import { AdminStatsGridSkeleton, AdminTableSkeleton } from "@/components/admin/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-6 w-32" />
      <AdminStatsGridSkeleton count={3} />
      <AdminTableSkeleton rows={5} />
    </div>
  );
}