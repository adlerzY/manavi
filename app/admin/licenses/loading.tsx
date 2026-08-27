import { AdminCollapsibleTriggerSkeleton, AdminTableSkeleton } from "@/components/admin/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-8">
      <AdminCollapsibleTriggerSkeleton />
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <AdminTableSkeleton rows={8} />
      </div>
    </div>
  );
}