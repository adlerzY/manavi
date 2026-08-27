import { AdminTableSkeleton } from "@/components/admin/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-10">
      <Skeleton className="h-6 w-40" />
      <div>
        <Skeleton className="mb-3 h-5 w-48" />
        <AdminTableSkeleton rows={4} />
      </div>
      <div>
        <Skeleton className="mb-3 h-5 w-48" />
        <AdminTableSkeleton rows={4} />
      </div>
    </div>
  );
}