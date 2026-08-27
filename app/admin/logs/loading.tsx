import { AdminToolbarSkeleton, AdminTableSkeleton, AdminPaginationSkeleton } from "@/components/admin/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-6 w-32" />
      <AdminToolbarSkeleton />
      <AdminTableSkeleton rows={10} />
      <AdminPaginationSkeleton />
    </div>
  );
}